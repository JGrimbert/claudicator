import fs from "fs";
import { spawn } from "child_process";
import { getIssuesWithBodies } from "$lib/server/services/github";
import { getCurrentProject } from "$lib/server/services/projects";
import { prepareIssues, buildUpdatePrompt } from "$lib/server/agent/issue-analysis";

const ANALYSIS_FILE = ".agent/analysis.md";
const SNAPSHOT_FILE = ".agent/analysis-snapshot.json";

function stripAnsi(str: string): string {
    return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').replace(/\x1B\][^\x07]*\x07/g, '').trim();
}

export async function POST() {
    const project = getCurrentProject();
    const owner = project?.owner;
    const repo  = project?.repo;

    if (!owner || !repo) {
        return new Response(JSON.stringify({ error: "Aucun owner/repo configuré" }), {
            status: 500, headers: { "Content-Type": "application/json" }
        });
    }

    // Charger l'analyse existante
    if (!fs.existsSync(ANALYSIS_FILE)) {
        return new Response(JSON.stringify({ error: "Aucune analyse existante" }), {
            status: 400, headers: { "Content-Type": "application/json" }
        });
    }
    const existingAnalysis = fs.readFileSync(ANALYSIS_FILE, "utf-8");

    // Charger le snapshot existant
    let snapshot: Array<{ number: number; title: string; updatedAt: string }> = [];
    if (fs.existsSync(SNAPSHOT_FILE)) {
        try { snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf-8")); } catch { /* ignore */ }
    }

    // Récupérer les issues actuelles et calculer les nouvelles/modifiées
    let prompt: string;
    let newSnapshotData: Array<{ number: number; title: string; updatedAt: string }>;
    try {
        const raw = await getIssuesWithBodies(owner, repo);
        const snapshotMap = new Map(snapshot.map(s => [s.number, s.updatedAt]));
        const toIntegrate = raw.filter(i =>
            !snapshotMap.has(i.number) || i.updatedAt > (snapshotMap.get(i.number) ?? "")
        );

        if (toIntegrate.length === 0) {
            return new Response(JSON.stringify({ message: "Aucune issue à intégrer" }), {
                status: 200, headers: { "Content-Type": "application/json" }
            });
        }

        const prepared = await prepareIssues(toIntegrate);
        prompt = buildUpdatePrompt(existingAnalysis, prepared);
        newSnapshotData = raw.map(i => ({ number: i.number, title: i.title, updatedAt: i.updatedAt }));
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
            status: 500, headers: { "Content-Type": "application/json" }
        });
    }

    const encoder = new TextEncoder();
    const allAgentLines: string[] = [];
    let resultSubtype: string | null = null;

    const stream = new ReadableStream({
        start(controller) {
            const emit = (line: string, type: "agent" | "system" | "usage" = "agent") => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line, type })}\n\n`));
                } catch { /* stream fermé */ }
                if (type === "agent") allAgentLines.push(line);
            };

            const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;
            const root = project?.path ?? process.cwd();

            const proc = spawn(
                "claude",
                ["-p", "--verbose", "--dangerously-skip-permissions", "--output-format", "stream-json"],
                { shell: true, windowsHide: true, env: cleanEnv, cwd: root }
            );
            if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }
            if (proc.pid) emit(`[pid:${proc.pid}]`, "system");

            let stdoutBuf = "";
            let stderrBuf = "";

            proc.stdout.on("data", (chunk: Buffer) => {
                stdoutBuf += chunk.toString();
                const lines = stdoutBuf.split("\n");
                stdoutBuf = lines.pop() ?? "";
                for (const rawLine of lines) {
                    if (!rawLine.trim()) continue;
                    try {
                        const obj = JSON.parse(rawLine);
                        if (obj.type === "assistant") {
                            for (const block of (obj.message?.content ?? [])) {
                                if (block.type === "text" && block.text) emit(block.text, "agent");
                                else if (block.type === "tool_use" && block.name) {
                                    const inp = block.input as Record<string, unknown> | undefined;
                                    const hint = inp ? Object.values(inp).find(v => typeof v === "string") as string | undefined : undefined;
                                    emit(`⚙ ${block.name}${hint ? ` ${hint.slice(0, 80)}` : ""}`, "system");
                                }
                            }
                        } else if (obj.type === "result") {
                            resultSubtype = obj.subtype ?? null;
                        }
                    } catch {
                        emit(rawLine, "agent");
                    }
                }
            });

            proc.stderr.on("data", (chunk: Buffer) => {
                stderrBuf += chunk.toString();
                const lines = stderrBuf.split("\n");
                stderrBuf = lines.pop() ?? "";
                lines.forEach(l => {
                    const line = stripAnsi(l);
                    if (!line || line.length < 2) return;
                    emit(line, "system");
                });
            });

            proc.on("error", (err: Error) => {
                emit(`[erreur: ${err.message}]`, "system");
                try { controller.close(); } catch { /* déjà fermé */ }
            });

            proc.on("close", (code: number | null) => {
                if (stdoutBuf.trim()) {
                    try {
                        const obj = JSON.parse(stdoutBuf.trim());
                        if (obj.type === "assistant") {
                            for (const block of (obj.message?.content ?? [])) {
                                if (block.type === "text" && block.text) emit(block.text, "agent");
                            }
                        } else if (obj.type === "result") {
                            resultSubtype = obj.subtype ?? null;
                        }
                    } catch { emit(stdoutBuf, "agent"); }
                }
                if (stderrBuf.trim()) emit(stderrBuf, "system");

                const success = code === 0 || resultSubtype === "success";
                if (success && allAgentLines.length > 0) {
                    fs.mkdirSync(".agent", { recursive: true });
                    fs.writeFileSync(ANALYSIS_FILE, allAgentLines.join("\n"), "utf-8");
                    // Upsert du snapshot (fusion, pas de doublons)
                    const snapshotMap = new Map(snapshot.map(s => [s.number, s]));
                    for (const entry of newSnapshotData) {
                        snapshotMap.set(entry.number, entry);
                    }
                    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify([...snapshotMap.values()], null, 2), "utf-8");
                }

                emit(`[${success ? "✓ terminé" : `erreur (code ${code})`}]`, "system");
                try { controller.close(); } catch { /* déjà fermé */ }
            });
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type":  "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive"
        }
    });
}
