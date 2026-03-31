import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getTasksDir, createTask, updateTask, getTask } from "$lib/server/services/tasks";
import { writeAtlasForIssues } from "$lib/server/agent/atlas";
import { createFullPlan, updateFullPlan, getFullPlanDir } from "$lib/server/services/fullPlans";
import { getProjectRoot } from "$lib/server/services/projects";

type RoadmapStep = {
    id: number;
    label: string;
    skill: string;
    nodes: string[];
    files: string[];
    rationale: string;
    dependsOnSteps: number[];
    issues?: number[];
};

type RoadmapCtx = { section: string; issueFiles: Map<number, string[]> };

function buildRoadmapContext(allIssues: IssueRef[]): RoadmapCtx {
    const empty: RoadmapCtx = { section: "", issueFiles: new Map() };
    const projectRoot = getProjectRoot();
    const jsonPath = path.join(projectRoot, "ai", "roadmap.json");
    if (!fs.existsSync(jsonPath)) return empty;

    let roadmap: { steps: RoadmapStep[] };
    try { roadmap = JSON.parse(fs.readFileSync(jsonPath, "utf-8")); } catch { return empty; }

    const steps = roadmap.steps ?? [];
    const issueNums = allIssues.map(i => i.number);
    const issueSet = new Set(issueNums);

    const issueToSteps = new Map<number, RoadmapStep[]>();
    for (const n of issueNums) issueToSteps.set(n, []);
    for (const s of steps) {
        for (const n of (s.issues ?? [])) {
            if (issueSet.has(n)) issueToSteps.get(n)?.push(s);
        }
    }

    // Dépendances inter-issues via les steps (heuristique)
    const stepToGroupIssues = new Map<number, number[]>();
    for (const s of steps) {
        const gi = (s.issues ?? []).filter(n => issueSet.has(n));
        if (gi.length) stepToGroupIssues.set(s.id, gi);
    }
    const issueDeps = new Map<number, Set<number>>();
    for (const n of issueNums) issueDeps.set(n, new Set());
    for (const s of steps) {
        for (const a of (stepToGroupIssues.get(s.id) ?? [])) {
            for (const depId of s.dependsOnSteps) {
                for (const b of (stepToGroupIssues.get(depId) ?? [])) {
                    issueDeps.get(a)?.add(b);
                }
            }
        }
    }

    // Collecter fichiers par issue (pour conflits)
    const issueFiles = new Map<number, string[]>();
    for (const issue of allIssues) {
        const isteps = issueToSteps.get(issue.number) ?? [];
        issueFiles.set(issue.number, [...new Set(isteps.flatMap(s => s.files))].filter(Boolean));
    }

    // Section DAG heuristique
    const dagLines: string[] = [];
    for (const issue of allIssues) {
        const deps = [...(issueDeps.get(issue.number) ?? [])];
        if (deps.length) dagLines.push(`  #${issue.number} ← ${deps.map(d => `#${d}`).join(", ")}`);
    }

    // Section contexte code par issue
    const ctxLines: string[] = [];
    for (const issue of allIssues) {
        const isteps = issueToSteps.get(issue.number) ?? [];
        const files = issueFiles.get(issue.number) ?? [];
        const nodes = [...new Set(isteps.flatMap(s => s.nodes))].filter(Boolean);
        const skills = [...new Set(isteps.map(s => s.skill))];
        const rationale = isteps.map(s => s.rationale).filter(Boolean).join(" / ").slice(0, 300);
        if (!files.length && !nodes.length) continue;
        ctxLines.push(`#### #${issue.number} — ${issue.title}`);
        if (skills.length) ctxLines.push(`- Skill: ${skills.join(", ")}`);
        if (nodes.length) ctxLines.push(`- Nœuds: \`${nodes.slice(0, 8).join("`, `")}\``);
        if (files.length) ctxLines.push(`- Fichiers: ${files.slice(0, 10).map(f => `\`${f}\``).join(", ")}`);
        if (rationale) ctxLines.push(`- Contexte: ${rationale}`);
    }

    let section = "";
    if (dagLines.length) section += `\n## DAG HEURISTIQUE (roadmap steps)\n${dagLines.join("\n")}\n`;
    if (ctxLines.length) section += `\n## CONTEXTE CODE PAR ISSUE\n${ctxLines.join("\n")}\n`;
    return { section, issueFiles };
}

function buildAiDagSection(groupKeyword: string, allIssues: IssueRef[], issueFiles: Map<number, string[]>): string {
    const evalPath = path.join(process.cwd(), ".agent", "eval-dags", `${groupKeyword}.json`);
    if (!fs.existsSync(evalPath)) return "";

    let evalDag: { deps: { from: number; to: number[] }[] };
    try { evalDag = JSON.parse(fs.readFileSync(evalPath, "utf-8")); } catch { return ""; }

    const deps = evalDag.deps ?? [];
    if (!deps.length) return "";

    const allNums = new Set(allIssues.map(i => i.number));

    // Niveaux topologiques
    const precedes = new Map<number, Set<number>>();
    const successors = new Map<number, number[]>();
    for (const n of allNums) { precedes.set(n, new Set()); successors.set(n, []); }
    for (const { from, to } of deps) {
        for (const t of to) {
            if (allNums.has(t) && allNums.has(from)) {
                precedes.get(t)?.add(from);
                successors.get(from)?.push(t);
            }
        }
    }
    const level = new Map<number, number>();
    const queue: number[] = [];
    for (const [n, preds] of precedes) {
        if (preds.size === 0) { level.set(n, 0); queue.push(n); }
    }
    let qi = 0;
    while (qi < queue.length) {
        const n = queue[qi++];
        for (const s of (successors.get(n) ?? [])) {
            const lv = (level.get(n) ?? 0) + 1;
            if (!level.has(s) || level.get(s)! < lv) { level.set(s, lv); queue.push(s); }
        }
    }
    for (const n of allNums) { if (!level.has(n)) level.set(n, 0); }

    // Grouper par niveau
    const byLevel = new Map<number, number[]>();
    for (const [n, lv] of level) {
        if (!byLevel.has(lv)) byLevel.set(lv, []);
        byLevel.get(lv)!.push(n);
    }
    const maxLevel = Math.max(...byLevel.keys());

    const lines: string[] = ["## ORDRE D'IMPLÉMENTATION (analyse IA)\n"];
    for (let lv = 0; lv <= maxLevel; lv++) {
        const issues = (byLevel.get(lv) ?? []).sort((a, b) => a - b);
        const label = lv === 0 ? "Racines — implémenter en premier" : `Niveau ${lv}`;
        lines.push(`**${label}** : ${issues.map(n => {
            const t = allIssues.find(i => i.number === n)?.title ?? "";
            return `#${n}${t ? ` (${t.slice(0, 35)})` : ""}`;
        }).join(", ")}`);
    }

    lines.push("\n**Dépendances explicites :**");
    for (const { from, to } of deps) {
        const filtered = to.filter(t => allNums.has(t));
        if (allNums.has(from) && filtered.length)
            lines.push(`  #${from} débloque → ${filtered.map(t => `#${t}`).join(", ")}`);
    }

    // Conflits de fichiers
    const fileToIssues = new Map<string, number[]>();
    for (const [n, files] of issueFiles) {
        for (const f of files) {
            if (!fileToIssues.has(f)) fileToIssues.set(f, []);
            fileToIssues.get(f)!.push(n);
        }
    }
    const conflicts = [...fileToIssues.entries()]
        .filter(([, issues]) => issues.length > 1)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 12);
    if (conflicts.length) {
        lines.push("\n## CONFLITS POTENTIELS (fichiers partagés entre issues)");
        for (const [file, issues] of conflicts)
            lines.push(`  \`${file}\` → ${issues.map(n => `#${n}`).join(", ")}`);
    }

    return "\n" + lines.join("\n") + "\n";
}

/**
 * POST /api/issues/groups/stack-plan-full
 * Body: { groupKeyword, subStacks, residualIssues }
 *
 * Génère ATLAS.md pour l'ensemble du groupe, puis streame Claude en SSE.
 * Format: data: {"line":"...","type":"agent"|"system"[,"planFile":"..."]}
 */

type IssueRef = { number: number; title: string; body?: string };

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json();
    const { groupKeyword, subStacks, residualIssues, existingTaskId } = body as {
        groupKeyword: string;
        subStacks: { keyword: string; issues: IssueRef[] }[];
        residualIssues?: IssueRef[];
        existingTaskId?: string;
    };

    if (!groupKeyword || !subStacks?.length) throw error(400, "groupKeyword et subStacks requis");

    const planId = `stack-full-${groupKeyword}-${Date.now()}`;
    createFullPlan({
        id: planId,
        keyword: groupKeyword,
        status: "generating",
        subStacks,
        residualIssues,
    });

    const allIssues: IssueRef[] = [
        ...subStacks.flatMap(s => s.issues),
        ...(residualIssues ?? [])
    ];

    const existingTask = existingTaskId ? getTask(existingTaskId) : null;
    const fpTask = existingTask
        ? (updateTask(existingTask.id, { fullPlanId: planId, status: "planification" }) ?? existingTask)
        : createTask({
            title: `Plan complet — ${groupKeyword} (${allIssues.length} issues)`,
            type: "fullplan",
            fullPlanId: planId,
            status: "planification",
        });

    // Enrichir ATLAS.md avec l'ensemble du groupe
    writeAtlasForIssues(allIssues, groupKeyword);

    // ATLAS par sub-stack (pour utilisation lors du lancement implémentation)
    const planDir = getFullPlanDir(planId);
    fs.mkdirSync(planDir, { recursive: true });
    const stepAtlasFiles: Record<string, string> = {};
    for (const s of subStacks) {
        const atlasPath = path.join(planDir, `atlas-${s.keyword}.md`);
        writeAtlasForIssues(s.issues, s.keyword, atlasPath);
        stepAtlasFiles[s.keyword] = atlasPath;
    }

    // Construire les sections par sous-stack
    const stackSections = subStacks.map(s => {
        const lines = s.issues.map(i => {
            const desc = i.body ? `\n  > ${i.body.replace(/\n+/g, " ").trim().slice(0, 200)}` : "";
            return `  - #${i.number} — ${i.title}${desc}`;
        }).join("\n");
        return `### Stack "${s.keyword}" (${s.issues.length} issues)\n${lines}`;
    }).join("\n\n");

    // Issues sans stack assignée → à intégrer obligatoirement dans le plan
    const unassignedSection = residualIssues && residualIssues.length > 0
        ? `\n### Issues non assignées (${residualIssues.length} — à intégrer dans le plan)\n` +
          residualIssues.map(i => `  - #${i.number} — ${i.title}`).join("\n")
        : "";

    const allIssueNums = allIssues.map(i => `#${i.number}`).join(", ");

    const { section: roadmapSection, issueFiles } = buildRoadmapContext(allIssues);
    const aiDagSection = buildAiDagSection(groupKeyword, allIssues, issueFiles);

    const issueList = allIssues.map(i => {
        const desc = i.body ? `\n  > ${i.body.replace(/\n+/g, " ").trim().slice(0, 200)}` : "";
        return `- #${i.number} — ${i.title}${desc}`;
    }).join("\n");

    const prompt = `# TASK : Plan complet du groupe "${groupKeyword}"
## ${allIssues.length} issues — COUVERTURE TOTALE OBLIGATOIRE

${issueList}
${aiDagSection}${roadmapSection}
## OBJECTIF
Produire un workflow ordonné couvrant la TOTALITÉ des ${allIssues.length} issues.
1. Regrouper dans une même étape les issues pouvant être commitées ensemble (domaine commun, pas de conflit fichiers)
2. Intégrer toutes les issues dans une étape — **aucune ne peut rester sans étape**
3. Ordonner selon le DAG de dépendances

## CONTRAINTES
- NE PAS commiter, NE PAS pousser, NE PAS modifier de fichiers
- Produire uniquement un plan textuel structuré

## ⚠️ FORMAT DE SORTIE OBLIGATOIRE

**Les blocs \`[ETAPE:N]...[/ETAPE:N]\` sont OBLIGATOIRES. Sans eux, le plan ne peut pas être exploité.**

Produire d'abord une section globale (index des étapes), puis CHAQUE étape dans son bloc marqueur.

### SECTION GLOBALE

# Plan complet — groupe "${groupKeyword}"

## Vue d'ensemble
(ordre d'implémentation recommandé, risques de conflits)

## Étapes
1. Étape 1 — #X, #Y : titre court
2. Étape 2 — #Z : titre court
...

---

### ÉTAPES DÉTAILLÉES — UN BLOC PAR ÉTAPE, OBLIGATOIRE

[ETAPE:1]
# Étape 1 — #X, #Y : titre

## Issues
- #X — titre
- #Y — titre

## Commit suggéré
\`type(scope): description (#X, #Y)\`

## Fichiers touchés
- \`src/path/to/file.ts\`

## Plan d'implémentation
### #X — titre
(description des changements)
### #Y — titre
(description des changements)
[/ETAPE:1]

[ETAPE:2]
...
[/ETAPE:2]

**RÈGLE ABSOLUE** : Ces ${allIssues.length} issues doivent TOUTES apparaître dans un bloc [ETAPE:N] : ${allIssueNums}
**RÈGLE ABSOLUE** : Chaque étape DOIT être encadrée par \`[ETAPE:N]\` et \`[/ETAPE:N]\` — sans exception.`;

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

            // Émettre le planId en premier event pour que le client puisse le référencer
            send({ type: "system", line: "[planId]", planId });

            const proc = spawn(claudeCmd, [
                "-p", "--verbose", "--dangerously-skip-permissions",
                "--output-format", "stream-json"
            ], {
                shell: true, windowsHide: true, env: cleanEnv, cwd: process.cwd()
            });
            if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }

            let fullOutput = "";
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
                                    fullOutput += block.text + "\n";
                                    send({ line: block.text, type: "agent" });
                                } else if (block.type === "tool_use" && block.name) {
                                    const inp = block.input as Record<string, unknown> | undefined;
                                    const hint = inp ? Object.values(inp).find(v => typeof v === "string") as string | undefined : undefined;
                                    send({ line: `⚙ ${block.name}${hint ? ` ${hint.slice(0, 80)}` : ""}`, type: "system" });
                                }
                            }
                        }
                    } catch {
                        fullOutput += rawLine + "\n";
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
                if (stdoutBuf.trim()) {
                    try {
                        const obj = JSON.parse(stdoutBuf.trim());
                        if (obj.type === "assistant") {
                            for (const block of (obj.message?.content ?? [])) {
                                if (block.type === "text" && block.text) fullOutput += block.text + "\n";
                            }
                        }
                    } catch { fullOutput += stdoutBuf + "\n"; }
                }

                // Extraire les blocs [ETAPE:N]...[/ETAPE:N]
                const parsedStepFiles: { filename: string; issues: number[]; content: string }[] = [];
                const stepRegex = /\[ETAPE:(\d+)\]([\s\S]*?)\[\/ETAPE:\1\]/g;
                let stepMatch: RegExpExecArray | null;
                while ((stepMatch = stepRegex.exec(fullOutput)) !== null) {
                    const stepNum = stepMatch[1];
                    const content = stepMatch[2].trim();
                    const filename = `etape-${stepNum}.md`;
                    const issueNums = [...content.matchAll(/#(\d+)/g)].map(x => parseInt(x[1]));
                    parsedStepFiles.push({ filename, issues: [...new Set(issueNums)], content });
                }

                // Plan global = tout avant le premier marqueur [ETAPE (ou output complet si aucun)
                const firstMarker = fullOutput.indexOf("[ETAPE:");
                const globalContent = firstMarker > 0
                    ? fullOutput.slice(0, firstMarker).trim()
                    : fullOutput;

                // Sauvegarder les fichiers d'étapes + générer ATLAS par étape
                for (const sf of parsedStepFiles) {
                    fs.writeFileSync(path.join(planDir, sf.filename), sf.content, "utf-8");
                    const stepIssueObjs = allIssues.filter(i => sf.issues.includes(i.number));
                    if (stepIssueObjs.length) {
                        const atlasPath = path.join(planDir, `atlas-${sf.filename}`);
                        writeAtlasForIssues(stepIssueObjs, sf.filename.replace(".md", ""), atlasPath);
                        stepAtlasFiles[sf.filename] = atlasPath;
                    }
                }

                const dir = getTasksDir();
                fs.mkdirSync(dir, { recursive: true });
                const planFile = `stack-full-${groupKeyword}-${Date.now()}.plan.md`;
                fs.writeFileSync(path.join(dir, planFile), globalContent, "utf-8");
                updateFullPlan(planId, {
                    status: "done",
                    planFile,
                    stepAtlasFiles,
                    stepFiles: parsedStepFiles.map(sf => ({ filename: sf.filename, issues: sf.issues })),
                });
                updateTask(fpTask.id, { status: "implementation" });
                send({ line: "[done]", type: "system", planFile });
                controller.close();
            });
            proc.on("error", (e: Error) => {
                updateFullPlan(planId, { status: "error" });
                updateTask(fpTask.id, { status: "failed" });
                send({ line: `[erreur] ${e.message}`, type: "system" });
                controller.close();
            });
        }
    });

    return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
};
