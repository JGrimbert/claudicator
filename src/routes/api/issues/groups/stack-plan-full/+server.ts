import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getTasksDir } from "$lib/server/services/tasks";
import { writeAtlasForIssues } from "$lib/server/agent/atlas";

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

    const allIssues: IssueRef[] = [
        ...subStacks.flatMap(s => s.issues),
        ...(residualIssues ?? [])
    ];

    // Enrichir ATLAS.md avec l'ensemble du groupe
    writeAtlasForIssues(allIssues, groupKeyword);

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

    const prompt = `useAtlas

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

    const stream = new ReadableStream({
        start(controller) {
            const enc = new TextEncoder();
            const send = (obj: object) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

            const proc = spawn(claudeCmd, ["-p", "--dangerously-skip-permissions"], {
                shell: true, windowsHide: true, env: cleanEnv, cwd: process.cwd()
            });
            if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }

            let fullOutput = "";

            proc.stdout?.on("data", (chunk: Buffer) => {
                const text = chunk.toString();
                fullOutput += text;
                for (const line of text.split("\n")) {
                    if (line.trim()) send({ line, type: "agent" });
                }
            });
            proc.stderr?.on("data", (chunk: Buffer) => {
                const line = chunk.toString().trim();
                if (line) send({ line, type: "system" });
            });
            proc.on("close", () => {
                const dir = getTasksDir();
                fs.mkdirSync(dir, { recursive: true });
                const planFile = `stack-full-${groupKeyword}-${Date.now()}.plan.md`;
                fs.writeFileSync(path.join(dir, planFile), fullOutput, "utf-8");
                send({ line: "[done]", type: "system", planFile });
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
