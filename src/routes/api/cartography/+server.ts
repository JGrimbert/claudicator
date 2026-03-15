/** Cartographie — recherche sémantique dans le projet (POST) */
import { json } from "@sveltejs/kit";
import { execSync } from "child_process";
import { resolve } from "path";
import { readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { getProjectRoot } from "$lib/server/services/projects";
import { getProjectConfig } from "$lib/server/services/project-config";

/** Mots vides à ignorer lors de l'extraction de mots-clés */
const STOPWORDS = new Set([
    'les', 'des', 'une', 'avec', 'dans', 'pour', 'par', 'sur', 'son', 'ses',
    'leur', 'leurs', 'est', 'sont', 'the', 'and', 'with', 'from', 'that',
    'this', 'they', 'have', 'been', 'selon', 'projet', 'chemin', 'affich',
]);

/** Extrait les mots-clés significatifs d'une query (longueur > 3, pas stopwords) */
function extractKeywords(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[\s\n\r\\\/.,;:!?()\[\]{}]+/)
        .filter(w => w.length > 3 && !STOPWORDS.has(w) && /^[a-z0-9àéèêëùûîïôœæç]+$/i.test(w));
}

/** Parcourt src/ récursivement et retourne tous les fichiers source */
function walkSrc(dir: string, out: string[] = []): string[] {
    if (!existsSync(dir)) return out;
    try {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith('.') || e.name === 'node_modules') continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walkSrc(full, out);
            else if (/\.(ts|tsx|js|jsx|svelte|vue)$/.test(e.name)) out.push(full);
        }
    } catch { /* dossier inaccessible */ }
    return out;
}

/**
 * Recherche des fichiers source dont le nom correspond à des mots-clés de la query.
 * Retourne des résultats complémentaires pour les fichiers non couverts par l'index.
 */
function fileNameSearch(query: string, projectPath: string, existingFiles: Set<string>) {
    const keywords = extractKeywords(query);
    if (keywords.length === 0) return [];

    const srcDir = path.join(projectPath, 'src');
    const allFiles = walkSrc(srcDir);

    return allFiles
        .filter(f => {
            const basename = path.basename(f).replace(/\.[^.]+$/, '').toLowerCase();
            return keywords.some(kw => basename.includes(kw) || kw.includes(basename));
        })
        .map(f => {
            const rel = path.relative(projectPath, f).replace(/\\/g, '/');
            return {
                key:          path.basename(f).replace(/\.[^.]+$/, ''),
                file:         rel,
                startLine:    null,
                endLine:      null,
                score:        0.5,
                role:         null,
                summary:      null,
                codeSnippet:  null,
                snippetError: null,
            };
        })
        .filter(r => !existingFiles.has(r.file))
        .slice(0, 8);
}

/** Recherche dans la cartographie du projet via script */
export async function POST({ request }) {
    const { query } = await request.json();

    if (!query?.trim()) {
        return json({ error: "Query manquant" }, { status: 400 });
    }

    const projectPath = getProjectRoot();
    const cartoPath   = process.env.CARTOGRAPHY_PATH ?? "C:/lolve-cartography";
    const scriptPath  = resolve("scripts/cartography-search.cjs");
    const config      = getProjectConfig();

    let results:     any[] = [];
    let grepResults: any[] = [];
    let grepMethods: any[] = [];

    try {
        const escaped = query.replace(/"/g, '\\"').replace(/\n/g, ' ');
        const output = execSync(
            `node "${scriptPath}" "${escaped}"`,
            {
                encoding: "utf-8",
                maxBuffer: 1024 * 1024 * 10,
                env: {
                    ...process.env,
                    LC_PROJECT_PATH:          projectPath,
                    CARTOGRAPHY_PATH:         cartoPath,
                    LC_IGNORE_DIRS:           JSON.stringify(config.extraIgnoreDirs),
                    LC_COMMENT_ONLY_KEYWORDS: JSON.stringify(config.commentOnlyKeywords),
                }
            }
        );

        const data = JSON.parse(output);
        if (data.error) return json({ error: data.error }, { status: 500 });

        results     = data.results     ?? [];
        grepResults = data.grepResults ?? [];
        grepMethods = data.grepMethods ?? [];
    } catch (err: any) {
        console.error("[/api/cartography]", err.message);
        // On continue pour proposer au moins les résultats par nom de fichier
    }

    // ── Recherche complémentaire par nom de fichier ────────────────────────────
    const existingFiles = new Set([...results, ...grepMethods].map((r: any) => r.file ?? ''));
    const fileMatches = fileNameSearch(query, projectPath, existingFiles);

    return json({
        results,
        grepResults,
        grepMethods: [...grepMethods, ...fileMatches],
    });
}
