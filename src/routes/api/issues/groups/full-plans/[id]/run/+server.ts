import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getFullPlan } from "$lib/server/services/fullPlans";
import { getTasksDir } from "$lib/server/services/tasks";

/**
 * POST /api/issues/groups/full-plans/[id]/run
 * Lance l'implémentation du plan complet via Claude en SSE.
 */
export const POST: RequestHandler = async ({ params }) => {
    const plan = getFullPlan(params.id);
    if (!plan) throw error(404, "Plan introuvable");
    if (plan.status !== "done") throw error(400, "Le plan n'est pas encore terminé");
    if (!plan.planFile) throw error(400, "Aucun fichier plan associé");

    const planContent = fs.readFileSync(path.join(getTasksDir(), plan.planFile), "utf-8");

    // Construire les sections ATLAS par sub-stack
    let atlasSection = "";
    if (plan.stepAtlasFiles && Object.keys(plan.stepAtlasFiles).length > 0) {
        const parts: string[] = ["## ATLAS par étape", ""];
        for (const [keyword, atlasPath] of Object.entries(plan.stepAtlasFiles)) {
            if (fs.existsSync(atlasPath)) {
                const atlasContent = fs.readFileSync(atlasPath, "utf-8");
                parts.push(`### Stack "${keyword}"`);
                parts.push(atlasContent.trim());
                parts.push("");
            }
        }
        atlasSection = "\n\n" + parts.join("\n");
    }

    const prompt = `useAtlas

# IMPLÉMENTATION : plan groupe "${plan.keyword}"

${planContent.trim()}${atlasSection}`;

    const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;
    const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";

    function stripAnsi(str: string): string {
        return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, "").replace(/\x1B\][^\x07]*\x07/g, "").trim();
    }

    const stream = new ReadableStream({
        start(controller) {
            const enc = new TextEncoder();
            const send = (obj: object) => {
                try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* fermé */ }
            };

            const proc = spawn(claudeCmd, [
                "-p", "--verbose", "--dangerously-skip-permissions",
                "--output-format", "stream-json"
            ], {
                shell: true, windowsHide: true, env: cleanEnv, cwd: process.cwd()
            });
            if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }

            let stdoutBuf = "";
            let stderrBuf = "";

            proc.stdout?.on("data", (chunk: Buffer) => {
                stdoutBuf += chunk.toString();
                const lines = stdoutBuf.split("\n");
                stdoutBuf = lines.pop() ?? "";
                for (const rawLine of lines) {
                    if (!rawLine.trim()) continue;
                    try {
                        const obj = JSON.parse(rawLine);
                        if (obj.type === "assistant") {
                            for (const block of (obj.message?.content ?? [])) {
                                if (block.type === "text" && block.text) {
                                    send({ line: block.text, type: "agent" });
                                } else if (block.type === "tool_use" && block.name) {
                                    const inp = block.input as Record<string, unknown> | undefined;
                                    const hint = inp ? Object.values(inp).find(v => typeof v === "string") as string | undefined : undefined;
                                    send({ line: `⚙ ${block.name}${hint ? ` ${hint.slice(0, 80)}` : ""}`, type: "system" });
                                }
                            }
                        }
                    } catch {
                        send({ line: rawLine, type: "agent" });
                    }
                }
            });
            proc.stderr?.on("data", (chunk: Buffer) => {
                stderrBuf += chunk.toString();
                const lines = stderrBuf.split("\n");
                stderrBuf = lines.pop() ?? "";
                for (const l of lines) {
                    const line = stripAnsi(l);
                    if (line && line.length >= 2) send({ line, type: "system" });
                }
            });
            proc.on("close", () => {
                send({ line: "[done]", type: "system" });
                controller.close();
            });
            proc.on("error", (e: Error) => {
                send({ line: `[erreur] ${e.message}`, type: "system" });
                controller.close();
            });
        }
    });

    return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
};
