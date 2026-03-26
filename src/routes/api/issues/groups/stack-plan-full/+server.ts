import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getTasksDir, createTask, updateTask } from "$lib/server/services/tasks";
import { writeAtlasForIssues } from "$lib/server/agent/atlas";
import { createFullPlan, updateFullPlan, getFullPlanDir } from "$lib/server/services/fullPlans";

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
    const { groupKeyword, subStacks, residualIssues } = body as {
        groupKeyword: string;
        subStacks: { keyword: string; issues: IssueRef[] }[];
        residualIssues?: IssueRef[];
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

    const fpTask = createTask({
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

    const residualSection = residualIssues && residualIssues.length > 0
        ? `\n### Résiduel (${residualIssues.length} issues)\n` +
          residualIssues.map(i => `  - #${i.number} — ${i.title}`).join("\n")
        : "";

    const stepsTemplate = subStacks.map(s =>
        `### Stack "${s.keyword}"\n` +
        s.issues.map((i, idx) =>
`#### Étape ${idx + 1} — #${i.number} : ${i.title}
- Commit : "type(scope): ..."
- Fichiers touchés :
- Diff attendu :`
        ).join("\n\n")
    ).join("\n\n");

    const prompt = `@"plan-complet (agent)"

# TASK : Plan complet du groupe "${groupKeyword}"
## ${subStacks.length} sous-stacks — ${allIssues.length} issues

${stackSections}${residualSection}

## OBJECTIF
Réflexion globale sur l'ensemble du groupe (dépendances inter-stacks, ordre recommandé).
Pour chaque sous-stack : ordre logique, commits indépendants, diff précis.

## CONTRAINTES IMPORTANTES
- NE PAS commiter, NE PAS pousser, NE PAS modifier de fichiers
- Produire uniquement un plan textuel structuré

## FORMAT DU PLAN
### Vue d'ensemble
(dépendances entre sous-stacks, ordre d'implémentation global, risques)

${stepsTemplate}`;

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
                const dir = getTasksDir();
                fs.mkdirSync(dir, { recursive: true });
                const planFile = `stack-full-${groupKeyword}-${Date.now()}.plan.md`;
                fs.writeFileSync(path.join(dir, planFile), fullOutput, "utf-8");
                updateFullPlan(planId, { status: "done", planFile, stepAtlasFiles });
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
