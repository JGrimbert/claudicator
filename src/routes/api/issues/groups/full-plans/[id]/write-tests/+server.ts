import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getFullPlan } from "$lib/server/services/fullPlans";
import { listTasks } from "$lib/server/services/tasks";
import { register, unregister } from "$lib/server/services/processes";
import { getAbsPatchesDir, getPatchContent } from "$lib/server/services/patches";

/**
 * POST /api/issues/groups/full-plans/[id]/write-tests
 * Body: { issueNumber: number, patchName: string }
 *
 * Lance Claude dans le worktree du fullplan pour écrire les tests manquants
 * d'une issue déjà implémentée, puis amende le commit et régénère le patch.
 */
export const POST: RequestHandler = async ({ params, request }) => {
    const plan = getFullPlan(params.id);
    if (!plan) throw error(404, "Plan introuvable");

    const body = await request.json() as { issueNumber: number; patchName: string };
    if (!body.issueNumber || !body.patchName) throw error(400, "issueNumber et patchName requis");

    const linkedTask = listTasks().find(t => t.fullPlanId === params.id);
    if (!linkedTask) throw error(400, "Aucune task liée à ce plan");

    const patchesDir = getAbsPatchesDir(linkedTask.id);
    const patchContent = getPatchContent(linkedTask.id, body.patchName);
    if (!patchContent) throw error(404, "Patch introuvable");

    // Trouver le worktree du fullplan (fullplan-<id> ou fullplan-<id>-*)
    const worktreesBase = path.join(process.cwd(), ".agent", "worktrees");
    let worktreePath = path.join(worktreesBase, `fullplan-${plan.id}`);
    if (!fs.existsSync(worktreePath)) {
        const dirs = fs.existsSync(worktreesBase)
            ? fs.readdirSync(worktreesBase).filter(d => d.startsWith(`fullplan-${plan.id}`))
            : [];
        if (dirs.length === 0) throw error(400, "Worktree introuvable — relancez l'implémentation d'abord");
        worktreePath = path.join(worktreesBase, dirs[0]);
    }

    const patchFile = path.join(patchesDir, body.patchName);

    const prompt = `# ÉCRITURE DE TESTS — Issue #${body.issueNumber} (plan "${plan.keyword}")

Le code de l'issue #${body.issueNumber} a déjà été implémenté.
Voici le patch correspondant :

\`\`\`diff
${patchContent.trim()}
\`\`\`

## OBJECTIF
Écris les tests manquants pour couvrir les changements de ce patch.

## RÈGLES
- Utilise les conventions de test existantes dans le projet (\`*.test.ts\` / \`*.spec.ts\`)
- Couvre les cas normaux ET les cas limites
- NE modifie PAS le code de production — seulement les fichiers de test
- Tu travailles dans le worktree : \`${worktreePath}\`

## COMMIT (amende le commit existant pour inclure les tests)
\`\`\`bash
git -C "${worktreePath}" add -A
git -C "${worktreePath}" commit --amend --no-edit
\`\`\`

## RÉGÉNÉRER LE PATCH (avec tests inclus)
\`\`\`bash
git -C "${worktreePath}" format-patch HEAD~1 --stdout > "${patchFile}"
\`\`\``;

    const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;
    const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";

    function stripAnsi(str: string): string {
        return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, "").replace(/\x1B\][^\x07]*\x07/g, "").trim();
    }

    const runId = `write-tests-${plan.id}-${body.issueNumber}`;

    const stream = new ReadableStream({
        start(controller) {
            const enc = new TextEncoder();
            const send = (obj: object) => {
                try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* fermé */ }
            };

            const proc = spawn(claudeCmd, [
                "-p", "--verbose", "--dangerously-skip-permissions",
                "--output-format", "stream-json",
                "--add-dir", worktreePath,
            ], {
                shell: true, windowsHide: true, env: cleanEnv, cwd: worktreePath
            });
            if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }
            register(runId, proc);
            if (proc.pid) send({ line: `[pid:${proc.pid}]`, type: "system" });
            send({ line: `[write-tests] #${body.issueNumber} — ${worktreePath}`, type: "system" });

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
                unregister(runId);
                send({ line: "[done]", type: "system" });
                controller.close();
            });
            proc.on("error", (e: Error) => {
                unregister(runId);
                send({ line: `[erreur] ${e.message}`, type: "system" });
                controller.close();
            });
        }
    });

    return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
};
