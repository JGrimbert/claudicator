import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getTasksDir } from "$lib/server/services/tasks";

/**
 * POST /api/issues/groups/stack-plan
 * Body: { keyword: string; parentKeyword: string; issues: { number: number; title: string }[] }
 *
 * Spawne Claude avec un prompt useAtlas pour générer un plan N-commits sur le sous-groupe.
 * Sauvegarde dans .agent/tasks/stack-{keyword}-{ts}.plan.md
 * Retourne : { planFile: string; content: string }
 */

async function callClaude(prompt: string, timeoutMs = 120_000): Promise<string> {
    return new Promise((resolve, reject) => {
        const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;
        const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";
        const proc = spawn(claudeCmd, ["-p", "--dangerously-skip-permissions"], {
            shell: true, windowsHide: true, env: cleanEnv, cwd: process.cwd()
        });

        const timer = setTimeout(() => {
            proc.kill();
            reject(new Error("Timeout (120s)"));
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
    const { keyword, parentKeyword, issues } = body as {
        keyword: string;
        parentKeyword: string;
        issues: { number: number; title: string }[];
    };

    if (!keyword || !issues?.length) throw error(400, "keyword et issues requis");

    const issueList = issues.map(i => `- #${i.number} — ${i.title}`).join("\n");
    const stepsTemplate = issues.map((i, idx) =>
        `### Étape ${idx + 1} — Issue #${i.number} : ${i.title}
- Commit : "type(scope): ..."
- Fichiers touchés :
- Diff attendu : description précise`
    ).join("\n\n");

    const prompt = `useAtlas

# TASK : Plan stack — sous-groupe "${keyword}"${parentKeyword ? ` (parent : ${parentKeyword})` : ""}
## Issues (${issues.length} → ${issues.length} commits autonomes)
${issueList}

## OBJECTIF
Réflexion globale (dépendances, ordre logique), puis pour chaque issue :
un commit indépendant + un diff précis (fichiers concernés, nature du changement).

## FORMAT DU PLAN
### Réflexion globale
(dépendances entre issues, ordre recommandé, risques)

${stepsTemplate}`;

    const content = await callClaude(prompt);

    const dir = getTasksDir();
    fs.mkdirSync(dir, { recursive: true });
    const planFile = `stack-${keyword}-${Date.now()}.plan.md`;
    fs.writeFileSync(path.join(dir, planFile), content, "utf-8");

    return json({ planFile, content });
};
