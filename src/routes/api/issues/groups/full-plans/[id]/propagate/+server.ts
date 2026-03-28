import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { getFullPlan } from "$lib/server/services/fullPlans";
import { findTaskGlobal } from "$lib/server/services/tasks";
import { getAbsPatchesDirFrom } from "$lib/server/services/patches";

/**
 * POST /api/issues/groups/full-plans/[id]/propagate
 * Body: { fromIssueNumber: number }
 *
 * Inspecte les patches des issues suivant fromIssueNumber et les adapte
 * au nouveau contexte introduit par le reprompt.
 * - Si un patch s'applique proprement → régénère le fichier .patch
 * - Si un patch est en conflit → Claude l'adapte dans le worktree temporaire
 *
 * Utilise le worktree temporaire créé par /reprompt (reprompt-<planId>-<issueNumber>)
 * qui est dans l'état juste après le commit du reprompt.
 */
export const POST: RequestHandler = async ({ params, request }) => {
    const plan = getFullPlan(params.id);
    if (!plan) throw error(404, "Plan introuvable");

    const body = await request.json() as { fromIssueNumber: number };
    if (!body.fromIssueNumber) throw error(400, "fromIssueNumber requis");

    const found = findTaskGlobal(t => t.fullPlanId === params.id);
    if (!found) throw error(400, "Aucune task liée à ce plan");
    const { task: linkedTask, tasksDir } = found;

    const patchesDir = getAbsPatchesDirFrom(tasksDir, linkedTask.id);
    const worktreesBase = path.join(process.cwd(), ".agent", "worktrees");

    const tempWorktreePath = path.join(worktreesBase, `reprompt-${plan.id}-${body.fromIssueNumber}`);
    if (!fs.existsSync(tempWorktreePath)) {
        throw error(400, "Worktree de reprompt introuvable — lancez d'abord un reprompt");
    }

    // Issues suivantes dans l'ordre du plan
    const allIssues = [
        ...plan.subStacks.flatMap(s => s.issues),
        ...(plan.residualIssues ?? []),
    ];
    const fromIdx = allIssues.findIndex(i => i.number === body.fromIssueNumber);
    const followingIssues = fromIdx >= 0 ? allIssues.slice(fromIdx + 1) : [];

    const fullPlanContent = plan.planFile
        ? fs.readFileSync(path.join(tasksDir, plan.planFile), "utf-8")
        : "";

    function stripAnsi(str: string): string {
        return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, "").replace(/\x1B\][^\x07]*\x07/g, "").trim();
    }

    function runClaudeAdapt(
        issue: { number: number; title: string },
        oldPatchContent: string,
        patchFile: string,
        send: (obj: object) => void
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const prompt = `# ADAPTATION : Issue #${issue.number} — propagation de changements

L'issue #${issue.number} ("${issue.title}") doit être re-implémentée suite à des changements dans une issue précédente.
Le worktree est dans l'état après ces changements — adapte l'implémentation à ce nouveau contexte.

## PLAN (pour contexte)
${fullPlanContent.trim()}

## ANCIEN PATCH (référence — ce qui avait été implémenté)
\`\`\`diff
${oldPatchContent.trim()}
\`\`\`

## WORKFLOW
Tu travailles dans le worktree : \`${tempWorktreePath}\`

### 1. Implémentation
Adapte et réimplémente le code de l'issue #${issue.number} en tenant compte du nouveau contexte.

### 2. Commit
\`\`\`bash
git -C "${tempWorktreePath}" add -A
git -C "${tempWorktreePath}" commit -m "feat: #${issue.number} — propagation"
\`\`\`

### 3. Patch
\`\`\`bash
git -C "${tempWorktreePath}" format-patch HEAD~1 --stdout > "${patchFile}"
\`\`\``;

            const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";
            const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;

            const proc = spawn(claudeCmd, [
                "-p", "--verbose", "--dangerously-skip-permissions",
                "--output-format", "stream-json",
                "--add-dir", tempWorktreePath,
            ], {
                shell: true, windowsHide: true, env: cleanEnv, cwd: tempWorktreePath
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
            proc.on("close", () => resolve());
            proc.on("error", reject);
        });
    }

    const stream = new ReadableStream({
        start(controller) {
            const enc = new TextEncoder();
            const send = (obj: object) => {
                try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* fermé */ }
            };

            (async () => {
                if (followingIssues.length === 0) {
                    send({ line: "[propagation] aucune issue suivante à inspecter", type: "system" });
                    send({ line: "[done]", type: "system" });
                    controller.close();
                    return;
                }

                send({ line: `[propagation] ${followingIssues.length} issue(s) à inspecter`, type: "system" });

                for (const issue of followingIssues) {
                    const patchFile = path.join(patchesDir, `issue-${issue.number}.patch`);
                    if (!fs.existsSync(patchFile)) {
                        send({ line: `— #${issue.number} : pas de patch, skip`, type: "system" });
                        continue;
                    }

                    // Vérifier si le patch s'applique proprement dans l'état courant du worktree
                    let canApply = false;
                    try {
                        execSync(`git -C "${tempWorktreePath}" apply --check "${patchFile}"`, { stdio: "pipe" });
                        canApply = true;
                    } catch { /* conflit */ }

                    if (canApply) {
                        try {
                            execSync(`git -C "${tempWorktreePath}" apply "${patchFile}"`, { stdio: "pipe" });
                            execSync(`git -C "${tempWorktreePath}" add -A`, { stdio: "pipe" });
                            execSync(`git -C "${tempWorktreePath}" commit -m "feat: #${issue.number} — propagation"`, { stdio: "pipe" });
                            const newPatch = execSync(
                                `git -C "${tempWorktreePath}" format-patch HEAD~1 --stdout`,
                                { stdio: "pipe" }
                            ).toString();
                            fs.writeFileSync(patchFile, newPatch);
                            send({ line: `✓ #${issue.number} — compatible, patch régénéré`, type: "system" });
                        } catch (e: any) {
                            send({ line: `✗ #${issue.number} — erreur application : ${e.message}`, type: "system" });
                        }
                    } else {
                        send({ line: `↺ #${issue.number} — conflit, Claude adapte...`, type: "system" });
                        const oldPatchContent = fs.readFileSync(patchFile, "utf-8");
                        await runClaudeAdapt(issue, oldPatchContent, patchFile, send);
                        send({ line: `✓ #${issue.number} — adapté`, type: "system" });
                    }
                }

                send({ line: "[done]", type: "system" });
                controller.close();
            })().catch(e => {
                send({ line: `[erreur propagation] ${e.message}`, type: "system" });
                controller.close();
            });
        }
    });

    return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
};
