import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { spawn } from "child_process";

/**
 * POST /api/issues/groups/haikus
 * Body: {
 *   groups: { keyword: string; keywords: string[]; issueTitles: string[] }[],
 *   subdivisions?: { keyword: string; keywords: string[]; issueTitles: string[] }[]
 * }
 *
 * Pour chaque groupe (et sous-groupe), spawne Claude CLI pour générer titre + description.
 * Retourne : { haikus: Record<keyword, { title: string, description: string } | { err: string }> }
 */

type GroupInput = { keyword: string; keywords: string[]; issueTitles: string[] };

const CONCURRENCY = 6;

async function callClaude(prompt: string, timeoutMs = 60_000): Promise<string> {
    return new Promise((resolve, reject) => {
        const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;
        const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";
        const proc = spawn(claudeCmd, ["-p", "--dangerously-skip-permissions"], {
            shell: true, windowsHide: true, env: cleanEnv, cwd: process.cwd()
        });

        const timer = setTimeout(() => {
            proc.kill();
            reject(new Error("Timeout (60s)"));
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

async function runCapped<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let idx = 0;
    async function worker() {
        while (idx < tasks.length) {
            const i = idx++;
            results[i] = await tasks[i]();
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, () => worker()));
    return results;
}

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json();
    const groups: GroupInput[] = body.groups ?? [];
    const subdivisions: GroupInput[] = body.subdivisions ?? [];
    const all = [...groups, ...subdivisions];

    if (all.length === 0) throw error(400, "groups requis");

    const haikus: Record<string, { title: string; description: string } | { err: string }> = {};

    await runCapped(all.map(group => async () => {
        const list = group.issueTitles.map(t => `- ${t}`).join("\n");
        const prompt = `Tu es un assistant de synthèse de projet.
Voici un groupe d'issues liées par le mot-clé "${group.keyword}" :
${list}

Génère un titre court (3-5 mots) et une description (1 phrase) qui résument l'intention de ce groupe.
Réponds uniquement en JSON valide : { "title": "...", "description": "..." }`;

        try {
            const raw = await callClaude(prompt);
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("Réponse JSON introuvable");
            const parsed = JSON.parse(match[0]);
            haikus[group.keyword] = {
                title: parsed.title ?? "",
                description: parsed.description ?? ""
            };
        } catch (e) {
            haikus[group.keyword] = { err: e instanceof Error ? e.message : String(e) };
        }
    }));

    return json({ haikus });
};
