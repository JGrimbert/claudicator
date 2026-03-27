import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

/**
 * POST /api/issues/groups/evaluate
 * Body: { keyword, issues, subdivisions? }
 *
 * Stream SSE du résultat d'évaluation Claude.
 * Events :
 *   data: {"line":"...","type":"agent"}      — texte généré
 *   data: {"type":"system","line":"[deps]","data":{...}} — DAG structuré extrait
 *   data: {"type":"system","line":"[done]"}  — fin
 */

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json();
    const { keyword, issues, subdivisions } = body as {
        keyword: string;
        issues: { number: number; title: string }[];
        subdivisions?: { keyword: string; issues: { number: number; title: string }[] }[];
    };

    if (!keyword || !issues?.length) throw error(400, "keyword et issues requis");

    const issueList = issues.map(i => `- #${i.number} — ${i.title}`).join("\n");
    const issueNums = issues.map(i => i.number).join(", ");

    const subDivText = (subdivisions ?? []).length > 0
        ? `\n## Subdivisions détectées\n${subdivisions!.map(s =>
            `- Stack "${s.keyword}" : ${s.issues.map(i => `#${i.number}`).join(", ")}`
        ).join("\n")}`
        : "";

    const prompt = `# ÉVALUATION DU GROUPE D'ISSUES — "${keyword}"

## Issues du groupe (${issues.length})
${issueList}
${subDivText}

## OBJECTIF
Évalue ce groupe d'issues pour aider à décider s'il faut un ou plusieurs fullPlans.
N'implémente rien. N'utilise pas d'outils. Produis uniquement l'analyse en texte, puis le JSON structuré.

## FORMAT DE SORTIE OBLIGATOIRE

### Partie 1 — Analyse textuelle

## Analyse du groupe

**Complexité par issue :**
(pour chaque issue : simple / moyen / complexe + une ligne d'explication)

**Dépendances :**
(quelles issues doivent précéder d'autres, ou "aucune dépendance forte")

**Recommandation :**
(1 fullPlan ou N fullPlans — justification concise)

**Si segmentation recommandée — Segments proposés :**
(liste des segments avec leurs issues)

**Risques :**
(zones de couplage fort, issues ambiguës, zones fragiles du code)

**Effort estimé :**
(petit / moyen / important pour l'ensemble du groupe)

### Partie 2 — JSON structuré (obligatoire, à la fin)

Après l'analyse textuelle, émettre EXACTEMENT ce bloc (ne rien omettre) :

[DEPS]
{"deps":[{"from":N,"to":[M,P]}],"complexity":{"${issueNums.split(", ").map(n => `"${n}":"simple|moyen|complexe"`).join(",")}},"segments":[["#N","#M"],["#P"]]}
[/DEPS]

Règles :
- "from" = issue prérequis, "to" = issues qu'elle débloque
- N'inclure que les dépendances réelles (omettre si aucune dépendance)
- "complexity" : clé = numéro d'issue (string), valeur = "simple" | "moyen" | "complexe"
- Inclure TOUTES les issues (${issueNums}) dans "complexity"
- "segments" : liste de groupes d'issues recommandés (tableau de tableaux de strings "#N")`;

    const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;
    const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";

    function stripAnsi(str: string): string {
        return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, "").replace(/\x1B\][^\x07]*\x07/g, "").trim();
    }

    function extractDeps(fullText: string): object | null {
        const match = fullText.match(/\[DEPS\]\s*([\s\S]*?)\s*\[\/DEPS\]/);
        if (!match) return null;
        try { return JSON.parse(match[1]); } catch { return null; }
    }

    const stream = new ReadableStream({
        start(controller) {
            const enc = new TextEncoder();
            const send = (obj: object) => {
                try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* fermé */ }
            };

            const proc = spawn(claudeCmd, [
                "-p", "--verbose", "--dangerously-skip-permissions",
                "--output-format", "stream-json"
            ], {
                shell: true, windowsHide: true, env: cleanEnv, cwd: process.cwd()
            });
            if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }

            let stdoutBuf = "";
            let stderrBuf = "";
            let fullOutput = "";

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
                                    fullOutput += block.text;
                                    send({ line: block.text, type: "agent" });
                                }
                            }
                        }
                    } catch {
                        const clean = stripAnsi(rawLine);
                        if (clean) send({ line: clean, type: "system" });
                    }
                }
            });

            proc.stderr?.on("data", (chunk: Buffer) => { stderrBuf += chunk.toString(); });

            proc.on("close", (code: number | null) => {
                if (code !== 0 && stderrBuf.trim()) {
                    send({ line: `Erreur : ${stderrBuf.trim().slice(0, 200)}`, type: "error" });
                }
                const deps = extractDeps(fullOutput);
                if (deps) {
                    try {
                        const dir = path.join(process.cwd(), ".agent", "eval-dags");
                        fs.mkdirSync(dir, { recursive: true });
                        fs.writeFileSync(
                            path.join(dir, `${keyword}.json`),
                            JSON.stringify({ keyword, deps, issues: issues.map(i => i.number), timestamp: Date.now() })
                        );
                    } catch { /* ignore */ }
                    send({ type: "system", line: "[deps]", data: deps });
                }
                send({ type: "system", line: "[done]" });
                try { controller.close(); } catch { /* déjà fermé */ }
            });

            proc.on("error", (e) => {
                send({ line: `Erreur process : ${e.message}`, type: "error" });
                send({ type: "system", line: "[done]" });
                try { controller.close(); } catch { /* déjà fermé */ }
            });
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    });
};
