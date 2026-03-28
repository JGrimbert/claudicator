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
 * POST /api/issues/groups/full-plans/[id]/rerun-stale
 * Body: { staleIssueNumbers: number[] }
 *
 * Régénération rapide des patches périmés :
 * 1. Supprime les patches depuis la première issue périmée (dans l'ordre du plan)
 * 2. Resets le worktree au commit parent de cette première issue
 * 3. Lance une seule instance Claude pour tout régénérer — comme /run initial
 *
 * Contrairement à reprompt+propagate, aucune analyse diff par étape.
 */
export const POST: RequestHandler = async ({ params, request }) => {
    const plan = getFullPlan(params.id);
    if (!plan) throw error(404, "Plan introuvable");

    const body = await request.json() as { staleIssueNumbers: number[] };
    if (!body.staleIssueNumbers?.length) throw error(400, "staleIssueNumbers requis");

    const found = findTaskGlobal(t => t.fullPlanId === params.id);
    if (!found) throw error(400, "Aucune task liée à ce plan");
    const { task: linkedTask, tasksDir } = found;

    const patchesDir = getAbsPatchesDirFrom(tasksDir, linkedTask.id);
    const worktreesBase = path.join(process.cwd(), ".agent", "worktrees");
    const worktreePath = path.join(worktreesBase, `fullplan-${plan.id}`);

    // Issues dans l'ordre du plan
    const allIssues = [
        ...plan.subStacks.flatMap(s => s.issues),
        ...(plan.residualIssues ?? []),
    ];

    // Première issue périmée dans l'ordre du plan
    const firstStaleIdx = allIssues.findIndex(i => body.staleIssueNumbers.includes(i.number));
    if (firstStaleIdx < 0) throw error(400, "Aucune des issues spécifiées trouvée dans le plan");

    const firstStaleIssue = allIssues[firstStaleIdx];
    const issuesToRegen = allIssues.slice(firstStaleIdx);
    const issuesDone = allIssues.slice(0, firstStaleIdx);

    // 1. Supprimer les patches depuis la première issue périmée
    fs.mkdirSync(patchesDir, { recursive: true });
    for (const issue of issuesToRegen) {
        const patchFile = path.join(patchesDir, `issue-${issue.number}.patch`);
        if (fs.existsSync(patchFile)) fs.unlinkSync(patchFile);
    }

    // 2. Reset le worktree au parent du commit de la première issue périmée
    const root = getProjectRoot();
    if (fs.existsSync(worktreePath)) {
        let resetHash = "";
        try {
            const commitHash = execSync(
                `git -C "${worktreePath}" log --format="%H" -1 --grep "^feat: #${firstStaleIssue.number} "`,
                { stdio: "pipe" }
            ).toString().trim();
            if (commitHash) {
                resetHash = execSync(
                    `git -C "${worktreePath}" rev-parse "${commitHash}^"`,
                    { stdio: "pipe" }
                ).toString().trim();
            }
        } catch { /* commit introuvable — on reste où on est */ }

        if (resetHash) {
            try {
                execSync(`git -C "${worktreePath}" reset --hard "${resetHash}"`, { stdio: "pipe" });
            } catch { /* ignore */ }
        }
    } else {
        // Worktree absent — le créer depuis HEAD du projet
        fs.mkdirSync(worktreesBase, { recursive: true });
        const worktreeBranch = `fullplan-${plan.id}`;
        let branchExists = false;
        try {
            execSync(`git -C "${root}" rev-parse --verify "${worktreeBranch}"`, { stdio: "pipe" });
            branchExists = true;
        } catch { /* inexistante */ }

        if (branchExists) {
            execSync(`git -C "${root}" worktree add "${worktreePath}" "${worktreeBranch}"`, { stdio: "pipe" });
        } else {
            execSync(`git -C "${root}" worktree add "${worktreePath}" -b "${worktreeBranch}"`, { stdio: "pipe" });
        }
    }

    // 3. Prompt — plan complet + note sur les issues déjà faites
    const fullPlanContent = plan.planFile
        ? fs.readFileSync(path.join(tasksDir, plan.planFile), "utf-8")
        : "";

    const skipNote = issuesDone.length > 0
        ? `\n\n## ISSUES DÉJÀ IMPLÉMENTÉES — ne pas retoucher\n${issuesDone.map(i => `- #${i.number} — ${i.title}`).join("\n")}\n\nCommence directement par l'issue #${firstStaleIssue.number}.`
        : "";

    const prompt = `# IMPLÉMENTATION (régénération) : plan "${plan.keyword}"

${fullPlanContent.trim()}${skipNote}

## WORKFLOW PAR ISSUE — OBLIGATOIRE

Tu travailles dans le worktree isolé : \`${worktreePath}\`
Le worktree est dans l'état juste avant l'issue #${firstStaleIssue.number}.

Pour chaque issue à implémenter (à partir de #${firstStaleIssue.number}), dans l'ordre :

### 1. Tests d'abord (TDD)
Écris ou mets à jour les fichiers de test.

### 2. Implémentation
Implémente le code pour faire passer les tests.

### 3. Commit dans le worktree
\`\`\`bash
git -C "${worktreePath}" add -A
git -C "${worktreePath}" commit -m "feat: #N — <titre court>"
\`\`\`

### 4. Générer le patch
\`\`\`bash
git -C "${worktreePath}" format-patch HEAD~1 --stdout > "${patchesDir}/issue-N.patch"
\`\`\`

Règles :
- Remplace N par le numéro de l'issue (ex: issue-42.patch)
- Un commit + un patch par issue, dans l'ordre du plan
- Les issues suivantes s'appuient sur les commits précédents dans ce même worktree`;

    const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;
    const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";

    function stripAnsi(str: string): string {
        return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, "").replace(/\x1B\][^\x07]*\x07/g, "").trim();
    }

    const runId = `rerun-stale-${plan.id}`;

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
            send({ line: `[rerun-stale] ${issuesToRegen.length} issue(s) depuis #${firstStaleIssue.number} — worktree: ${worktreePath}`, type: "system" });
            if (issuesDone.length > 0) {
                send({ line: `[rerun-stale] issues conservées : ${issuesDone.map(i => `#${i.number}`).join(", ")}`, type: "system" });
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
