import { json } from "@sveltejs/kit";
import { getSnippet, getMethodFilePath } from "$lib/server/services/cartography";
import { getProjectRoot } from "$lib/server/services/projects";
import fs from "fs";
import path from "path";

/** Cherche un symbole dans les fichiers source TS/JS/Svelte par grep simple. */
function findSnippetInSources(key: string, root: string): { snippet: string; file: string } | null {
    // Nom court (sans prefix de classe) pour la recherche
    const shortName = key.split(".").at(-1) ?? key;
    const patterns = [
        new RegExp(`^\\s*(export\\s+)?(async\\s+)?function\\s+${shortName}\\b`),
        new RegExp(`^\\s*(export\\s+)?const\\s+${shortName}\\s*[=:]`),
        new RegExp(`^\\s*(export\\s+)?(async\\s+)?${shortName}\\s*\\(`),
    ];

    const exts = [".ts", ".svelte", ".js", ".cjs", ".mjs"];
    const skip = ["node_modules", ".git", ".cache", "dist", ".svelte-kit", "build"];

    function walkDir(dir: string): { snippet: string; file: string } | null {
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return null; }

        for (const e of entries) {
            if (skip.includes(e.name)) continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                const found = walkDir(full);
                if (found) return found;
            } else if (e.isFile() && exts.includes(path.extname(e.name))) {
                const result = tryExtract(full, patterns, root);
                if (result) return result;
            }
        }
        return null;
    }

    return walkDir(root);
}

function tryExtract(
    filePath: string,
    patterns: RegExp[],
    root: string
): { snippet: string; file: string } | null {
    let content: string;
    try { content = fs.readFileSync(filePath, "utf-8"); }
    catch { return null; }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
        if (!patterns.some(p => p.test(lines[i]))) continue;

        // Extraire jusqu'à la fermeture du bloc
        const start = Math.max(0, i - 1); // inclure commentaire éventuel au-dessus
        let depth = 0;
        let end = i;
        for (let j = i; j < Math.min(lines.length, i + 80); j++) {
            for (const ch of lines[j]) {
                if (ch === "{") depth++;
                else if (ch === "}") depth--;
            }
            end = j;
            if (depth < 0 || (depth === 0 && j > i)) break;
        }
        const rel = path.relative(root, filePath).replace(/\\/g, "/");
        const header = `// ${rel}:${i + 1}\n`;
        return {
            snippet: header + lines.slice(start, end + 1).join("\n"),
            file: rel,
        };
    }
    return null;
}

export async function GET({ url }) {
    const key = url.searchParams.get("key");
    if (!key) return json({ error: "Missing key" }, { status: 400 });
    const root = getProjectRoot();

    // 1. Méthode rapide via method-index (fichiers CJS indexés)
    const snippet = getSnippet(key, root);
    if (snippet) {
        const file = getMethodFilePath(key, root);
        return json({ key, snippet, file });
    }

    // 2. Fallback : recherche dans les sources TS/JS/Svelte
    const fallback = findSnippetInSources(key, root);
    if (fallback) return json({ key, snippet: fallback.snippet, file: fallback.file });

    return json({ error: "Not found" }, { status: 404 });
}
