import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { getFullPlan } from "$lib/server/services/fullPlans";
import { getTasksDir, listTasks, updateTask } from "$lib/server/services/tasks";
import { register, unregister } from "$lib/server/services/processes";
import { getProjectRoot } from "$lib/server/services/projects";
import { getAbsPatchesDir } from "$lib/server/services/patches";

/**
 * POST /api/issues/groups/full-plans/[id]/run
 * Lance l'implémentation du plan complet via Claude en SSE.
 * Claude travaille dans un worktree git isolé — le repo cible n'est PAS modifié directement.
 */
export const POST: RequestHandler = async ({ params, request }) => {
    const plan = getFullPlan(params.id);
    if (!plan) throw error(404, "Plan introuvable");
    if (plan.status !== "done") throw error(400, "Le plan n'est pas encore terminé");
    if (!plan.planFile) throw error(400, "Aucun fichier plan associé");

    const body = await request.json().catch(() => ({})) as { stackKeyword?: string };
    const stackKeyword = body?.stackKeyword;

    const root = getProjectRoot();
    const fullPlanContent = fs.readFileSync(path.join(getTasksDir(), plan.planFile), "utf-8");

    // Si stackKeyword fourni : extraire seulement la section de cette stack
    let planContent = fullPlanContent;
    if (stackKeyword) {
        const escaped = stackKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(^## Stack "${escaped}"[\\s\\S]*?)(?=^## Stack "|$)`, "m");
        const match = fullPlanContent.match(re);
        if (match) planContent = match[1].trim();
    }

    // Task liée (type fullplan) — pour mise à jour du statut + patches dir
    const linkedTask = listTasks().find(t => t.fullPlanId === params.id);
    const patchesDir = linkedTask ? getAbsPatchesDir(linkedTask.id) : null;
    if (patchesDir) fs.mkdirSync(patchesDir, { recursive: true });

    // ── Worktree isolé ────────────────────────────────────────────────────────
    // Claude travaille dans un worktree séparé du repo cible.
    // Le repo principal n'est JAMAIS modifié directement.
    const worktreesBase = path.join(process.cwd(), ".agent", "worktrees");
    fs.mkdirSync(worktreesBase, { recursive: true });
    const wtSuffix = stackKeyword ? `${plan.id}-${stackKeyword.replace(/[^a-z0-9]/gi, "-")}` : plan.id;
    const worktreePath = path.join(worktreesBase, `fullplan-${wtSuffix}`);
    const worktreeBranch = `fullplan-${wtSuffix}`;

    if (!fs.existsSync(worktreePath)) {
        // Vérifier si la branche existe déjà (reprise d'un run interrompu)
        let branchExists = false;
        try {
            execSync(`git -C "${root}" rev-parse --verify "${worktreeBranch}"`, { stdio: "pipe" });
            branchExists = true;
        } catch { /* branche inexistante */ }

        if (branchExists) {
            execSync(`git -C "${root}" worktree add "${worktreePath}" "${worktreeBranch}"`, { stdio: "pipe" });
        } else {
            execSync(`git -C "${root}" worktree add "${worktreePath}" -b "${worktreeBranch}"`, { stdio: "pipe" });
        }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Construire les sections ATLAS (filtrées si stackKeyword)
    let atlasSection = "";
    if (plan.stepAtlasFiles && Object.keys(plan.stepAtlasFiles).length > 0) {
        const parts: string[] = ["## ATLAS par étape", ""];
        const entries = stackKeyword
            ? Object.entries(plan.stepAtlasFiles).filter(([k]) => k === stackKeyword)
            : Object.entries(plan.stepAtlasFiles);
        for (const [keyword, atlasPath] of entries) {
            if (fs.existsSync(atlasPath)) {
                const atlasContent = fs.readFileSync(atlasPath, "utf-8");
                parts.push(`### Stack "${keyword}"`);
                parts.push(atlasContent.trim());
                parts.push("");
            }
        }
        atlasSection = "\n\n" + parts.join("\n");
    }

    const workflowInstruction = patchesDir ? `

## WORKFLOW PAR ISSUE — OBLIGATOIRE

Tu travailles dans le worktree isolé : \`${worktreePath}\`
Ce worktree est une copie propre du repo cible. **NE modifie PAS les fichiers en dehors de ce worktree.**

Pour chaque issue #N mentionnée dans ce plan, dans l'ordre :

### 1. Tests d'abord (TDD)
Avant d'écrire le code de production, crée les fichiers de test :
- Nomme-les \`*.test.ts\` ou \`*.spec.ts\` selon les conventions du projet
- Couvre les cas normaux ET les cas limites
- NE PASSE PAS à l'étape suivante sans avoir écrit les tests

### 2. Implémentation
Implémente le code pour faire passer les tests.

### 3. Commit dans le worktree
\`\`\`bash
git -C "${worktreePath}" add -A
git -C "${worktreePath}" commit -m "feat: #N — <titre court de l'issue>"
\`\`\`

### 4. Générer le patch
\`\`\`bash
git -C "${worktreePath}" format-patch HEAD~1 --stdout > "${patchesDir}/issue-N.patch"
\`\`\`

Règles :
- Remplace N par le numéro de l'issue (ex: issue-42.patch)
- Un commit + un patch par issue, dans l'ordre du plan
- Les issues suivantes s'appuient sur les commits précédents dans ce même worktree` : "";

    const prompt = `# IMPLÉMENTATION : plan groupe "${plan.keyword}"

${planContent.trim()}${atlasSection}${workflowInstruction}`;

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
                "--output-format", "stream-json",
                "--add-dir", worktreePath,
            ], {
                shell: true, windowsHide: true, env: cleanEnv, cwd: worktreePath
            });
            if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }
            register(plan.id, proc);
            if (linkedTask) updateTask(linkedTask.id, { status: "implementation" });
            if (proc.pid) send({ line: `[pid:${proc.pid}]`, type: "system" });
            send({ line: `[worktree] ${worktreePath}`, type: "system" });

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
                unregister(plan.id);
                send({ line: "[done]", type: "system" });
                controller.close();
            });
            proc.on("error", (e: Error) => {
                unregister(plan.id);
                if (linkedTask) updateTask(linkedTask.id, { status: "failed" });
                send({ line: `[erreur] ${e.message}`, type: "system" });
                controller.close();
            });
        }
    });

    return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
};
