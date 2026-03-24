/** Atlas — génère ATLAS.md (partagé entre generate/+server.ts et run/+server.ts) */
import path from "path";
import fs from "fs";
import type { Task } from "$lib/server/services/tasks";
import { searchMethods, getSnippet } from "$lib/server/services/cartography";

const CLAUDICATOR_ROOT = process.cwd();

function buildQuery(title: string, description?: string): string {
    if (!description) return title;
    return `${title} ${description.replace(/\n+/g, " ").trim().slice(0, 250)}`;
}

/** Écrit ATLAS.md et retourne le nombre de points d'entrée et le coût en tokens. */
export function writeAtlasMd(
    task: Task,
    description?: string
): { entryPoints: number; tokenCost: number } {
    const query = buildQuery(task.title, description);
    const hits  = searchMethods(query, CLAUDICATOR_ROOT);

    const lines: string[] = [];
    lines.push("# Atlas — Claudicator");
    if (task.issueNumber) {
        lines.push(`_Généré pour : Issue #${task.issueNumber} — ${task.title}_`);
    } else {
        lines.push(`_Généré pour : ${task.title}_`);
    }
    lines.push("");

    if (hits.length > 0) {
        const issueRef = task.issueNumber ? ` (issue #${task.issueNumber})` : "";
        lines.push(`## Points d'entrée${issueRef}`);
        lines.push("");
        lines.push("Ces symboles ont été identifiés comme pertinents :");
        lines.push("");
        lines.push("| Symbole | Fichier | Signature |");
        lines.push("|---|---|---|");
        for (const { key, method } of hits) {
            const sym  = key.split(".").at(-1) ?? key;
            const file = (method.file ?? "").replace(/\\/g, "/");
            const sig  = method.signature ?? sym;
            lines.push(`| \`${sym}\` | \`${file}\` | \`${sig}\` |`);
        }
        lines.push("");
        lines.push("---");
        lines.push("");

        // Snippets pour les méthodes les plus chaudes (top 2, score >= 4)
        const hotHits = hits.filter(h => h.score >= 4).slice(0, 2);
        if (hotHits.length > 0) {
            lines.push("## Snippets");
            lines.push("");
            for (const { key, method } of hotHits) {
                const snippet = getSnippet(key, CLAUDICATOR_ROOT);
                if (!snippet) continue;
                const sym = key.split(".").at(-1) ?? key;
                lines.push(`### \`${sym}\``);
                lines.push(`_${(method.file ?? "").replace(/\\/g, "/")}_`);
                lines.push("");
                lines.push("```ts");
                lines.push(snippet.trim());
                lines.push("```");
                lines.push("");
            }
        }
    }

    const content  = lines.join("\n");
    const atlasPath = path.join(CLAUDICATOR_ROOT, "ATLAS.md");
    fs.writeFileSync(atlasPath, content, "utf-8");
    return { entryPoints: hits.length, tokenCost: Math.round(content.length / 4) };
}

/**
 * Si ATLAS.md est absent, le génère (sans GitHub — sync).
 * Retourne le contenu du fichier, ou undefined si la génération échoue.
 */
export function ensureAtlasMd(task: Task): string | undefined {
    const atlasPath = path.join(CLAUDICATOR_ROOT, "ATLAS.md");
    if (!fs.existsSync(atlasPath)) {
        try {
            writeAtlasMd(task);
        } catch { /* silencieux — on continue sans atlas */ }
    }
    try {
        return fs.readFileSync(atlasPath, "utf-8");
    } catch {
        return undefined;
    }
}
