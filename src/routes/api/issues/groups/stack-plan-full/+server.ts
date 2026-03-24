import { json, error } from "@sveltejs/kit";
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
 * Génère ATLAS.md pour l'ensemble du groupe, puis appelle Claude avec un prompt
 * useAtlas couvrant toutes les sous-stacks. Sauvegarde dans .agent/tasks/.
 */

type IssueRef = { number: number; title: string; body?: string };

async function callClaude(prompt: string, timeoutMs = 180_000): Promise<string> {
    return new Promise((resolve, reject) => {
        const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;
        const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";
        const proc = spawn(claudeCmd, ["-p", "--dangerously-skip-permissions"], {
            shell: true, windowsHide: true, env: cleanEnv, cwd: process.cwd()
        });

        const timer = setTimeout(() => {
            proc.kill();
            reject(new Error("Timeout (180s)"));
        }, timeoutMs);

        let out = "";
        let err = "";
        if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }
        proc.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
        proc.stderr?.on("data", (d: Buffer) => { err += d.toString(); });
        proc.on("close", (code: number | null) => {
            clearTimeout(timer);
            if (code === 0) resolve(out.trim());
            else reject(new Error(err.trim() || `code ${code}`));
        });
        proc.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
}

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

    const content = await callClaude(prompt);

    const dir = getTasksDir();
    fs.mkdirSync(dir, { recursive: true });
    const planFile = `stack-full-${groupKeyword}-${Date.now()}.plan.md`;
    fs.writeFileSync(path.join(dir, planFile), content, "utf-8");

    return json({ planFile, content });
};
