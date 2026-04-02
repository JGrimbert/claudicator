import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { getFullPlan, getFullPlanDir } from "$lib/server/services/fullPlans";
import { getTasksDir, findTaskGlobal, updateTaskGlobal } from "$lib/server/services/tasks";
import { register, unregister } from "$lib/server/services/processes";
import { getProjectRoot } from "$lib/server/services/projects";
import { getAbsPatchesDirFrom } from "$lib/server/services/patches";

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

    const body = await request.json().catch(() => ({})) as { stackKeyword?: string; reset?: boolean };
    const { stackKeyword, reset } = body;

    const root = getProjectRoot();

    // Task liée (type fullplan) — cherche dans tous les projets (cross-project)
    const foundTask = findTaskGlobal(t => t.fullPlanId === params.id);
    const linkedTask = foundTask?.task ?? null;
    const tasksDir = foundTask?.tasksDir ?? getTasksDir();
    const patchesDir = foundTask ? getAbsPatchesDirFrom(foundTask.tasksDir, foundTask.task.id) : null;

    // ── Worktree isolé ────────────────────────────────────────────────────────
    const worktreesBase = path.join(process.cwd(), ".agent", "worktrees");
    fs.mkdirSync(worktreesBase, { recursive: true });
    const wtSuffix = stackKeyword ? `${plan.id}-${stackKeyword.replace(/[^a-z0-9]/gi, "-")}` : plan.id;
    const worktreePath = path.join(worktreesBase, `fullplan-${wtSuffix}`);
    const worktreeBranch = `fullplan-${wtSuffix}`;

    // ── Reset : vider patches + supprimer worktree + branche pour repartir propre ──
    if (reset) {
        if (patchesDir && fs.existsSync(patchesDir)) {
            for (const f of fs.readdirSync(patchesDir))
                if (f.endsWith(".patch") || f === "run-started-at.json")
                    fs.unlinkSync(path.join(patchesDir, f));
        }
        if (fs.existsSync(worktreePath)) {
            try { execSync(`git -C "${root}" worktree remove --force "${worktreePath}"`, { stdio: "pipe" }); } catch { /* best-effort */ }
        }
        try { execSync(`git -C "${root}" branch -D "${worktreeBranch}"`, { stdio: "pipe" }); } catch { /* branche inexistante */ }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (patchesDir) {
        fs.mkdirSync(patchesDir, { recursive: true });
        const timingPath = path.join(patchesDir, "run-started-at.json");
        if (!fs.existsSync(timingPath)) {
            fs.writeFileSync(timingPath, JSON.stringify({ startedAt: Date.now() }));
        }
    }

    const fullPlanContent = fs.readFileSync(path.join(tasksDir, plan.planFile), "utf-8");

    // Si stackKeyword fourni : extraire seulement la section de cette stack
    let planContent = fullPlanContent;
    if (stackKeyword) {
        const escaped = stackKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(^## Stack "${escaped}"[\\s\\S]*?)(?=^## Stack "|$)`, "m");
        const match = fullPlanContent.match(re);
        if (match) planContent = match[1].trim();
    }

    // Injecter les étapes détaillées avec ATLAS inline (nouveau format stepFiles)
    if (!stackKeyword && plan.stepFiles?.length) {
        const planDir = getFullPlanDir(plan.id);
        const stepContents = plan.stepFiles
            .map(sf => {
                const sfPath = path.join(planDir, sf.filename);
                if (!fs.existsSync(sfPath)) return "";
                let stepText = `## ${sf.filename.replace(".md", "")}\n\n${fs.readFileSync(sfPath, "utf-8")}`;
                // ATLAS inline : injecté directement sous le contenu de l'étape
                const stepKey = sf.filename.replace(".md", "");
                const atlasPath = plan.stepAtlasFiles?.[stepKey];
                if (atlasPath && fs.existsSync(atlasPath)) {
                    const atlasContent = fs.readFileSync(atlasPath, "utf-8");
                    stepText += `\n\n> **ATLAS — Points d'entrée** : lis directement ces fichiers avant d'implémenter cette étape. Si ces symboles couvrent déjà le périmètre, ne fais pas de Glob/Grep aveugle.\n\n${atlasContent.trim()}`;
                }
                return stepText;
            })
            .filter(Boolean)
            .join("\n\n---\n\n");
        if (stepContents) planContent += "\n\n# ÉTAPES DÉTAILLÉES\n\n" + stepContents;
    }

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

    // ATLAS section (legacy : uniquement pour stackKeyword runs ou anciens plans sans stepFiles)
    let atlasSection = "";
    if (plan.stepAtlasFiles && Object.keys(plan.stepAtlasFiles).length > 0 && (stackKeyword || !plan.stepFiles?.length)) {
        const parts: string[] = ["## ATLAS — Points d'entrée", "", "> Lis directement les fichiers listés ci-dessous avant d'implémenter. Si ces symboles couvrent le périmètre, ne fais pas de Glob/Grep aveugle.", ""];
        const entries = stackKeyword
            ? Object.entries(plan.stepAtlasFiles).filter(([k]) => k === stackKeyword)
            : Object.entries(plan.stepAtlasFiles);
        for (const [keyword, atlasPath] of entries) {
            if (fs.existsSync(atlasPath)) {
                const atlasContent = fs.readFileSync(atlasPath, "utf-8");
                parts.push(`### Étape "${keyword}"`);
                parts.push(atlasContent.trim());
                parts.push("");
            }
        }
        atlasSection = "\n\n" + parts.join("\n");
    }

    const workflowInstruction = patchesDir ? `

## WORKFLOW TDD PAR ÉTAPE — OBLIGATOIRE

Tu travailles dans le worktree isolé : \`${worktreePath}\`
**NE modifie JAMAIS de fichiers en dehors de ce worktree.**

---

### CONVENTIONS DE TEST (Vitest)

- Nommage : \`*.test.ts\` colocalisé avec la source (jamais de dossier \`__tests__/\`)
- Services / endpoints : tester le contrat public
- Composants Svelte : tester les services consommés, pas \`+page.svelte\` directement
- Mocks : \`vi.mock('$lib/server/services/...')\` pour les modules serveur dans les tests de routes
- Runner : \`npm test -- <fichier.test.ts>\` depuis le worktree

---

### CYCLE PAR ÉTAPE (dans l'ordre du plan)

**ÉTAPE N** couvre les issues indiquées dans le plan.

#### 0. VÉRIFICATION PRÉALABLE — Détecter les ambiguïtés

Avant d'écrire quoi que ce soit, inspecte le code existant dans ce worktree :
- Le comportement décrit dans le plan est-il **déjà présent** dans les fichiers ?
- Le code à supprimer a-t-il **déjà été supprimé** ?
- Une implémentation partielle ou différente existe-t-elle ?

**Si l'étape est déjà entièrement implémentée** → passe directement au protocole DÉJÀ FAIT ci-dessous.
**Si l'étape est partiellement faite** → note ce qui manque, implémente uniquement le delta.
**Si l'étape est absente** → cycle TDD normal.

---

#### PROTOCOLE DÉJÀ FAIT

Si le code visé par l'étape est déjà en place :

1. Écris un test de non-régression minimal qui **vérifie** le comportement attendu
\`\`\`bash
npm test -- <fichier.test.ts>
\`\`\`
→ Le test **doit passer** (c'est normal — le code est déjà là).

2. Commit avec le préfixe \`chore(already-done)\` :
\`\`\`bash
git -C "${worktreePath}" add -A
git -C "${worktreePath}" commit -m "chore(already-done): #N déjà implémenté — test de non-régression"
\`\`\`

3. Génère le patch normalement :
\`\`\`bash
git -C "${worktreePath}" format-patch HEAD~1 --stdout > "${patchesDir}/issue-N[-M].patch"
\`\`\`

4. Passe à l'étape suivante. **N'essaie pas de réécrire ce qui fonctionne déjà.**

---

#### 1. RED — Écrire les tests (cycle normal uniquement)
\`\`\`bash
# Crée les *.test.ts pour les issues de l'étape
npm test -- <fichier.test.ts>
\`\`\`
→ Le test **DOIT échouer**. S'il passe immédiatement, applique le **PROTOCOLE DÉJÀ FAIT** — ne réécris pas le test pour forcer un échec artificiel.
→ NE PASSE PAS à l'étape GREEN tant que le RED n'est pas confirmé.

#### 2. GREEN — Implémenter
Écris le code minimal pour faire passer les tests.
\`\`\`bash
npm test -- <fichier.test.ts>
\`\`\`
→ Le test **DOIT passer**. S'il échoue encore → corrige, ne passe pas à la suite.

#### 3. Commit dans le worktree
\`\`\`bash
git -C "${worktreePath}" add -A
git -C "${worktreePath}" commit -m "feat(scope): description (#N[, #M])"
\`\`\`

#### 4. Générer le patch
\`\`\`bash
git -C "${worktreePath}" format-patch HEAD~1 --stdout > "${patchesDir}/issue-N[-M].patch"
\`\`\`
Exemple pour une étape couvrant #132 et #18 : \`issue-132-18.patch\`

---

### RÈGLES ABSOLUES
- Un commit = une étape du plan (peut couvrir plusieurs issues)
- Un patch = un commit, nommé avec TOUS les numéros d'issues de l'étape
- Ne jamais forcer un RED artificiel si le code est déjà correct — utiliser le PROTOCOLE DÉJÀ FAIT
- Si aucun test unitaire n'est pertinent (pur CSS, config), rédige un test minimal et explique pourquoi
- Chaque étape s'appuie sur les commits précédents dans ce worktree` : "";

    const hasAtlas = plan.stepAtlasFiles && Object.keys(plan.stepAtlasFiles).length > 0;
    const atlasInstruction = hasAtlas ? `

## NAVIGATION PAR ATLAS — OBLIGATOIRE

Chaque étape détaillée ci-dessous contient une section **ATLAS — Points d'entrée**.
Avant d'implémenter une étape :
1. Consulte sa section ATLAS et lis directement les fichiers qui y sont listés
2. Utilise ces symboles comme points de départ — ne recharge pas l'arborescence complète si l'Atlas couvre déjà le périmètre
3. Les snippets fournis permettent de comprendre la logique existante sans lecture supplémentaire

` : "\n\n";

    const stepCount = plan.stepFiles?.length ?? 0;
    const strictStepRule = patchesDir ? `
## ⚠️ CONTRAINTE ABSOLUE — UN PATCH PAR ÉTAPE

Tu dois traiter chaque étape **séquentiellement**, une par une, dans l'ordre.
**INTERDIT** de regrouper plusieurs étapes dans un seul commit ou patch.

Pour chaque étape (${stepCount > 0 ? `il y en a **${stepCount}** au total` : "voir plan ci-dessous"}) :
1. Fais le cycle TDD complet (RED → GREEN)
2. Commit dans le worktree
3. Génère le patch immédiatement **avant de passer à l'étape suivante**

Le résultat final doit être exactement **${stepCount > 0 ? stepCount : "N"} patches** dans \`${patchesDir}\`.
Un seul grand patch regroupant tout est un **échec**.

` : "";

    const prompt = `# IMPLÉMENTATION : plan groupe "${plan.keyword}"
${strictStepRule}${atlasInstruction}${planContent.trim()}${atlasSection}${workflowInstruction}`;

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
            if (linkedTask) updateTaskGlobal(linkedTask.id, { status: "implementation" });
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
                if (linkedTask) updateTaskGlobal(linkedTask.id, { status: "failed" });
                send({ line: `[erreur] ${e.message}`, type: "system" });
                controller.close();
            });
        }
    });

    return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
};
