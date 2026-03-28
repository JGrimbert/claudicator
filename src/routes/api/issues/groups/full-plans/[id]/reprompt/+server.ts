import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { getFullPlan } from "$lib/server/services/fullPlans";
import { findTaskGlobal } from "$lib/server/services/tasks";
import { register, unregister } from "$lib/server/services/processes";
import { getAbsPatchesDirFrom } from "$lib/server/services/patches";
import { getProjectRoot } from "$lib/server/services/projects";

/**
 * POST /api/issues/groups/full-plans/[id]/reprompt
 * Body: { issueNumber: number, extraContext?: string }
 *
 * Rejoue l'implémentation d'une issue spécifique dans un worktree temporaire
 * branché sur le commit parent de l'issue dans le worktree principal.
 * Le worktree temporaire est conservé pour la propagation automatique.
 */
export const POST: RequestHandler = async ({ params, request }) => {
    const plan = getFullPlan(params.id);
    if (!plan) throw error(404, "Plan introuvable");

    const body = await request.json() as { issueNumber: number; extraContext?: string };
    if (!body.issueNumber) throw error(400, "issueNumber requis");

    const found = findTaskGlobal(t => t.fullPlanId === params.id);
    if (!found) throw error(400, "Aucune task liée à ce plan");
    const { task: linkedTask, tasksDir } = found;

    const patchesDir = getAbsPatchesDirFrom(tasksDir, linkedTask.id);
    fs.mkdirSync(patchesDir, { recursive: true });
    const patchFile = path.join(patchesDir, `issue-${body.issueNumber}.patch`);

    const root = getProjectRoot();
    const worktreesBase = path.join(process.cwd(), ".agent", "worktrees");

    // Trouver le worktree principal du fullplan
    let mainWorktreePath = path.join(worktreesBase, `fullplan-${plan.id}`);
    if (!fs.existsSync(mainWorktreePath)) {
        const dirs = fs.existsSync(worktreesBase)
            ? fs.readdirSync(worktreesBase).filter(d => d.startsWith(`fullplan-${plan.id}`))
            : [];
        mainWorktreePath = dirs.length > 0 ? path.join(worktreesBase, dirs[0]) : root;
    }

    // Trouver le commit parent de l'issue #N dans le worktree principal
    // Format déterministe : "feat: #N — <titre>"
    let parentHash = "";
    try {
        const commitHash = execSync(
            `git -C "${mainWorktreePath}" log --format="%H" -1 --grep "^feat: #${body.issueNumber} "`,
            { stdio: "pipe" }
        ).toString().trim();
        if (commitHash) {
            parentHash = execSync(
                `git -C "${mainWorktreePath}" rev-parse "${commitHash}^"`,
                { stdio: "pipe" }
            ).toString().trim();
        }
    } catch { /* fallback */ }

    // Worktree temporaire pour le reprompt, depuis le commit parent
    const tempWorktreePath = path.join(worktreesBase, `reprompt-${plan.id}-${body.issueNumber}`);
    if (fs.existsSync(tempWorktreePath)) {
        try { execSync(`git -C "${root}" worktree remove --force "${tempWorktreePath}"`, { stdio: "pipe" }); } catch { /* ignore */ }
    }
    if (parentHash) {
        execSync(`git -C "${root}" worktree add --detach "${tempWorktreePath}" ${parentHash}`, { stdio: "pipe" });
    } else {
        // Fallback : pas de commit trouvé → partir de HEAD du worktree principal
        execSync(`git -C "${root}" worktree add --detach "${tempWorktreePath}" "${mainWorktreePath === root ? "HEAD" : `$(git -C "${mainWorktreePath}" rev-parse HEAD)`}"`, { shell: true, stdio: "pipe" });
    }

    const fullPlanContent = plan.planFile
        ? fs.readFileSync(path.join(tasksDir, plan.planFile), "utf-8")
        : "(plan non disponible)";

    const extraSection = body.extraContext?.trim()
        ? `\n\n## CONTEXTE SUPPLÉMENTAIRE\n${body.extraContext.trim()}`
        : "";

    const prompt = `# REPROMPT : Issue #${body.issueNumber} — plan "${plan.keyword}"

Rejoue l'implémentation de l'issue #${body.issueNumber} UNIQUEMENT.

## PLAN COMPLET (pour contexte)
${fullPlanContent.trim()}${extraSection}

## WORKFLOW
Tu travailles dans le worktree isolé : \`${tempWorktreePath}\`
Ce worktree est dans l'état JUSTE AVANT l'issue #${body.issueNumber}.

### 1. Tests d'abord (TDD)
Écris ou mets à jour les fichiers de test pour l'issue #${body.issueNumber}.

### 2. Implémentation
Implémente le code pour faire passer les tests.

### 3. Commit dans le worktree
\`\`\`bash
git -C "${tempWorktreePath}" add -A
git -C "${tempWorktreePath}" commit -m "feat: #${body.issueNumber} — reprompt"
\`\`\`

### 4. Générer le patch
\`\`\`bash
git -C "${tempWorktreePath}" format-patch HEAD~1 --stdout > "${patchFile}"
\`\`\``;

    const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;
    const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";

    function stripAnsi(str: string): string {
        return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, "").replace(/\x1B\][^\x07]*\x07/g, "").trim();
    }

    const runId = `reprompt-${plan.id}-${body.issueNumber}`;

    const stream = new ReadableStream({
        start(controller) {
            const enc = new TextEncoder();
            const send = (obj: object) => {
                try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* fermé */ }
            };

            const proc = spawn(claudeCmd, [
                "-p", "--verbose", "--dangerously-skip-permissions",
                "--output-format", "stream-json",
                "--add-dir", tempWorktreePath,
            ], {
                shell: true, windowsHide: true, env: cleanEnv, cwd: tempWorktreePath
            });
            if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }
            register(runId, proc);
            if (proc.pid) send({ line: `[pid:${proc.pid}]`, type: "system" });
            send({ line: `[reprompt] #${body.issueNumber} — worktree: ${tempWorktreePath}`, type: "system" });
            if (parentHash) {
                send({ line: `[reprompt] depuis le commit parent ${parentHash.slice(0, 8)}`, type: "system" });
            }

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
