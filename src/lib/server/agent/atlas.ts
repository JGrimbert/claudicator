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

type RouteHit = { routePath: string; file: string; handlers: string[]; description: string | null };

/**
 * Cherche les routes API pertinentes par matching des segments de chemin et du commentaire de fichier.
 * Compense l'absence de scoring sémantique pour les exports génériques SvelteKit (GET/POST/etc.).
 */
function findRelevantRoutes(projectRoot: string, query: string): RouteHit[] {
    const routesDir = path.join(projectRoot, "src", "routes", "api");
    if (!fs.existsSync(routesDir)) return [];

    const queryTokens = query.toLowerCase().split(/[\s\-_\/\.#]+/).filter(t => t.length >= 3);
    if (queryTokens.length === 0) return [];

    const results: (RouteHit & { score: number })[] = [];

    function walk(dir: string): void {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            if (e.name !== "+server.ts") continue;

            const rel        = path.relative(projectRoot, full).split("\\").join("/");
            const routePath  = rel.replace(/^src\/routes/, "").replace(/\/\+server\.ts$/, "");
            const pathTokens = routePath.toLowerCase().split("/").filter(Boolean);

            let content = "";
            try { content = fs.readFileSync(full, "utf-8"); } catch { continue; }

            // Score 1 : tokens de la query présents dans les segments de chemin
            let score = queryTokens.filter(qt =>
                pathTokens.some(seg => seg.includes(qt) || qt.includes(seg))
            ).length;

            // Score 2 : tokens de la query présents dans le commentaire de tête de fichier
            const fileComment = content.match(/^\/\*\*([\s\S]*?)\*\//)?.[1] ?? "";
            const commentText = fileComment.replace(/\s*\*\s?/g, " ").toLowerCase();
            score += queryTokens.filter(qt => commentText.includes(qt)).length;

            if (score === 0) continue;

            // Noms des handlers exportés (GET, POST, etc.)
            const handlers = [...content.matchAll(/export\s+(?:async\s+)?(?:function\s+|const\s+)(\w+)/g)]
                .map(m => m[1])
                .filter(name => /^(GET|POST|PUT|PATCH|DELETE|HEAD)$/.test(name));

            // Description : premier commentaire JSDoc ou commentaire inline avant le premier handler
            let description: string | null = fileComment
                ? fileComment.replace(/\s*\*\s?/g, " ").trim().slice(0, 120) || null
                : null;
            if (!description) {
                const inlineMatch = content.match(/\/\/\s*(.+)\n(?:export\s+(?:async\s+)?(?:function|const)\s+(?:GET|POST|PUT|PATCH|DELETE))/);
                if (inlineMatch) description = inlineMatch[1].trim();
            }

            results.push({ routePath, file: rel, handlers, description, score });
        }
    }

    walk(routesDir);
    return results
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ routePath, file, handlers, description }) => ({ routePath, file, handlers, description }));
}

/** Écrit ATLAS.md et retourne le nombre de points d'entrée et le coût en tokens. */
export function writeAtlasMd(
    task: Task,
    description?: string
): { entryPoints: number; tokenCost: number } {
    const query      = buildQuery(task.title, description);
    const hits       = searchMethods(query, CLAUDICATOR_ROOT);
    const routeHits  = findRelevantRoutes(CLAUDICATOR_ROOT, query);

    // Fichiers déjà couverts par les hits symboliques (éviter les doublons)
    const hitFiles = new Set(hits.map(h => (h.method.file ?? "").split("\\").join("/")));
    const newRoutes = routeHits.filter(r => !hitFiles.has(r.file));

    const totalEntries = hits.length + newRoutes.length;

    const lines: string[] = [];
    lines.push("# Atlas — Claudicator");
    if (task.issueNumber) {
        lines.push(`_Généré pour : Issue #${task.issueNumber} — ${task.title}_`);
    } else {
        lines.push(`_Généré pour : ${task.title}_`);
    }
    lines.push("");

    if (totalEntries > 0) {
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
        for (const r of newRoutes) {
            const handlers = r.handlers.length > 0 ? r.handlers.join(", ") : "handler";
            const desc     = r.description ? ` — ${r.description.slice(0, 80)}` : "";
            lines.push(`| \`${r.routePath}\` | \`${r.file}\` | \`${handlers}\`${desc} |`);
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

    const content   = lines.join("\n");
    const atlasPath = path.join(CLAUDICATOR_ROOT, "ATLAS.md");
    fs.writeFileSync(atlasPath, content, "utf-8");
    return { entryPoints: totalEntries, tokenCost: Math.round(content.length / 4) };
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
