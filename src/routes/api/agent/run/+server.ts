import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { getTask, updateTask, getTasksDir } from "$lib/server/services/tasks";
import type { TokenUsage } from "$lib/server/services/tasks";
import { register, unregister, killProcess } from "$lib/server/services/processes";
import { getProjectRoot } from "$lib/server/services/projects";
import { addProjectUsage } from "$lib/server/services/usage";
import { loadMethodSnippets } from "$lib/server/agent/context";
import { formatImplementationPrompt, loadProjectDocs } from "$lib/server/agent/prompt";
import { generateAtlasStrings } from "$lib/server/services/cartography";

function stripAnsi(str: string): string {
    return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').replace(/\x1B\][^\x07]*\x07/g, '').trim();
}

/** Sauvegarde uniquement le texte produit par l'agent (type "agent") dans <taskId>.plan.md. */
function savePlan(taskId: string, lines: string[]) {
    if (lines.length === 0) return;
    try {
        const dir = getTasksDir();
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${taskId}.plan.md`), lines.join("\n"), "utf-8");
    } catch { /* silencieux */ }
}

export async function POST({ request }) {
    const body = await request.json();
    const { prompt: rawPrompt, plan, taskId, projectRoot } = body;
    const root = projectRoot?.trim() || getProjectRoot();

    // Si un plan est fourni, construire le prompt enrichi côté serveur
    let prompt: string = rawPrompt ?? "";
    if (plan?.trim() && taskId) {
        const task = getTask(taskId);
        if (task) {
            const planHint = plan.replace(/\n+/g, " ").trim().slice(0, 250);
            const query    = `${task.title} ${planHint}`;
            const methods  = loadMethodSnippets(root, query);
            const docs     = loadProjectDocs(root);
            const atlas    = generateAtlasStrings(root, query)?.compressed;
            prompt = formatImplementationPrompt(task, plan, methods, docs, atlas);
        } else {
            prompt = plan;
        }
    }

    if (!prompt?.trim()) {
        return new Response(JSON.stringify({ error: "Prompt manquant" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    // Phase : plan si aucun plan fourni, implémentation sinon
    const isImplementationPhase = !!(plan?.trim() && taskId);

    if (taskId) {
        const task = getTask(taskId);
        if (!task) {
            return new Response(JSON.stringify({ error: "Task introuvable" }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (isImplementationPhase) {
            // Ne pas changer le statut pour l'implémentation, juste vider les logs
            updateTask(taskId, { logs: [] });
        } else {
            // Génération du plan : specification → planification
            updateTask(taskId, { status: "planification", logs: [] });
        }
    }

    const encoder = new TextEncoder();
    const allLogs: string[] = [];
    const planLines: string[] = []; // uniquement le texte agent (hors ⚙, hors system)
    let capturedUsage: TokenUsage | null = null;
    let resultSubtype: string | null = null;

    const stream = new ReadableStream({
        start(controller) {
            const emit = (line: string, type: "agent" | "system" | "usage" = "agent") => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line, type })}\n\n`));
                } catch { /* stream fermé */ }
                if (type !== "usage") allLogs.push(line);
                if (type === "agent") planLines.push(line);
            };

            // -p : mode non-interactif (print).
            // Le prompt est passé via stdin pour éviter les problèmes d'échappement
            // shell avec les prompts longs / multi-lignes.
            // Retirer les variables qui bloquent l'exécution :
            //   ANTHROPIC_API_KEY : si invalide, claude refuse de démarrer
            //   CLAUDECODE        : empêche les sessions imbriquées (Claude Code)
            const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;

            const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";
            const proc = spawn(
                claudeCmd,
                ["-p", "--verbose", "--dangerously-skip-permissions", "--output-format", "stream-json", "--add-dir", root],
                { shell: true, windowsHide: true, env: cleanEnv, cwd: root }
            );
            if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }
            if (taskId) register(taskId, proc);
            if (proc.pid) emit(`[pid:${proc.pid}]`, "system");

            // Buffer ligne par ligne pour ne pas couper les lignes en milieu de chunk.
            let stdoutBuf = "";
            let stderrBuf = "";

            proc.stdout.on("data", (chunk: Buffer) => {
                stdoutBuf += chunk.toString();
                const lines = stdoutBuf.split("\n");
                stdoutBuf = lines.pop() ?? "";
                for (const rawLine of lines) {
                    if (!rawLine.trim()) continue;
                    // Tenter de parser en JSON (format stream-json)
                    try {
                        const obj = JSON.parse(rawLine);
                        if (obj.type === "assistant") {
                            const content = obj.message?.content ?? [];
                            for (const block of content) {
                                if (block.type === "text" && block.text) {
                                    emit(block.text, "agent");
                                } else if (block.type === "tool_use" && block.name) {
                                    // Afficher l'activité outil comme log système
                                    const inp = block.input as Record<string, unknown> | undefined;
                                    const hint = inp ? Object.values(inp).find(v => typeof v === "string") as string | undefined : undefined;
                                    emit(`⚙ ${block.name}${hint ? ` ${hint.slice(0, 80)}` : ""}`, "system");
                                }
                            }
                        } else if (obj.type === "result") {
                            resultSubtype = obj.subtype ?? null;
                            const u = obj.usage;
                            if (u && (u.input_tokens !== undefined || u.inputTokens !== undefined)) {
                                capturedUsage = {
                                    inputTokens: u.input_tokens ?? u.inputTokens ?? 0,
                                    outputTokens: u.output_tokens ?? u.outputTokens ?? 0,
                                };
                                emit(JSON.stringify(capturedUsage), "usage");
                            }
                        }
                        // Autres types (system, user/tool_result, etc.) → ignorés silencieusement
                    } catch {
                        // Ligne non-JSON → émettre telle quelle (fallback)
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
                if (taskId) { unregister(taskId); updateTask(taskId, { status: "failed", logs: allLogs }); }
                try { controller.close(); } catch { /* déjà fermé */ }
            });
            proc.on("close", (code: number | null) => {
                if (stdoutBuf.trim()) {
                    // Traiter le buffer restant
                    try {
                        const obj = JSON.parse(stdoutBuf.trim());
                        if (obj.type === "assistant") {
                            const content = obj.message?.content ?? [];
                            for (const block of content) {
                                if (block.type === "text" && block.text) emit(block.text, "agent");
                                else if (block.type === "tool_use" && block.name) {
                                    const inp = block.input as Record<string, unknown> | undefined;
                                    const hint = inp ? Object.values(inp).find(v => typeof v === "string") as string | undefined : undefined;
                                    emit(`⚙ ${block.name}${hint ? ` ${hint.slice(0, 80)}` : ""}`, "system");
                                }
                            }
                        } else if (obj.type === "result") {
                            resultSubtype = obj.subtype ?? null;
                            const u = obj.usage;
                            if (u && (u.input_tokens !== undefined || u.inputTokens !== undefined)) {
                                capturedUsage = {
                                    inputTokens: u.input_tokens ?? u.inputTokens ?? 0,
                                    outputTokens: u.output_tokens ?? u.outputTokens ?? 0,
                                };
                                emit(JSON.stringify(capturedUsage), "usage");
                            }
                        }
                    } catch {
                        emit(stdoutBuf, "agent");
                    }
                }
                if (stderrBuf.trim()) emit(stderrBuf, "system");

                // Succès si exit 0 OU si Claude a signalé subtype:"success" dans le JSON
                const success = code === 0 || resultSubtype === "success";
                const successStatus = isImplementationPhase ? "documentation" : "implementation";
                const status = success ? successStatus : "failed";
                if (taskId) {
                    unregister(taskId);
                    if (success && capturedUsage) {
                        // Calculer le totalUsage cumulé
                        const existing = getTask(taskId);
                        const prev = existing?.totalUsage;
                        const totalUsage: TokenUsage = {
                            inputTokens: (prev?.inputTokens ?? 0) + capturedUsage.inputTokens,
                            outputTokens: (prev?.outputTokens ?? 0) + capturedUsage.outputTokens,
                        };
                        updateTask(taskId, { status, logs: allLogs, usage: capturedUsage, totalUsage });
                        addProjectUsage(capturedUsage.inputTokens, capturedUsage.outputTokens);
                    } else {
                        updateTask(taskId, { status, logs: allLogs });
                    }
                    if (success && !isImplementationPhase) savePlan(taskId, planLines);
                }
                const msg = success ? "✓ terminé" : `erreur (code ${code})`;
                emit(`[${msg}]`, "system");
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
