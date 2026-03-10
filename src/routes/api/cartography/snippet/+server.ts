import { json } from "@sveltejs/kit";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getProjectRoot } from "$lib/server/services/projects";

/**
 * Pour les fichiers Vue SFC, le method-indexer parse le contenu trimmé du bloc <script>
 * et stocke des numéros de ligne relatifs à ce contenu.
 * Cette fonction retourne l'offset à ajouter pour obtenir la ligne réelle dans le fichier.
 * Retourne 0 pour les fichiers non-Vue.
 */
function getVueScriptOffset(filePath: string): number {
    if (!filePath.endsWith(".vue")) return 0;
    try {
        const content = readFileSync(filePath, "utf-8");
        const match = content.match(/<script(?:\s+setup)?[^>]*>/i);
        if (!match || match.index == null) return 0;
        const afterTagIdx = match.index + match[0].length;
        const leadingWS = content.substring(afterTagIdx).match(/^\s*/)?.[0] ?? "";
        const firstCodeIdx = afterTagIdx + leadingWS.length;
        return content.substring(0, firstCodeIdx).split("\n").length - 1;
    } catch {
        return 0;
    }
}

function extractSnippet(filePath: string, startLine: number, endLine?: number): string {
    if (!existsSync(filePath)) return "";
    const allLines = readFileSync(filePath, "utf-8").split("\n");
    const start = startLine - 1;

    if (endLine && endLine > startLine) {
        return allLines.slice(start, endLine).join("\n");
    }

    let depth = 0;
    let foundOpen = false;
    let endIdx = Math.min(start + 39, allLines.length - 1);

    for (let i = start; i < Math.min(start + 200, allLines.length); i++) {
        const line = allLines[i];
        for (const char of line) {
            if (char === "{") { depth++; foundOpen = true; }
            else if (char === "}") depth--;
        }
        if (foundOpen && depth <= 0) { endIdx = i; break; }
    }

    return allLines.slice(start, endIdx + 1).join("\n");
}

export function GET({ url }) {
    const key = url.searchParams.get("key");
    if (!key) return json({ error: "Paramètre key manquant" }, { status: 400 });

    const root = getProjectRoot();
    const indexPath = join(root, ".cache/method-index.json");

    if (!existsSync(indexPath)) {
        return json({ error: "Cartographie non disponible" }, { status: 404 });
    }

    let allMethods: Record<string, any>;
    try {
        allMethods = JSON.parse(readFileSync(indexPath, "utf-8")).methods ?? {};
    } catch {
        return json({ error: "Index illisible" }, { status: 500 });
    }

    const method = allMethods[key];
    if (!method) return json({ error: "Méthode introuvable" }, { status: 404 });

    const startLine = method.startLine ?? method.line;
    if (!method.file || !startLine) {
        return json({ error: "Emplacement source inconnu" }, { status: 404 });
    }

    const filePath = join(root, method.file);
    const vueOffset = getVueScriptOffset(filePath);
    const adjStart = startLine + vueOffset;
    const adjEnd = method.endLine ? method.endLine + vueOffset : undefined;
    const snippet = extractSnippet(filePath, adjStart, adjEnd);
    const endLine = adjEnd ?? adjStart + snippet.split("\n").length - 1;

    const parts = key.split(".");
    const sig = method.signature ?? parts.at(-1) ?? key;

    return json({
        key,
        file: method.file,
        startLine: adjStart,
        endLine,
        snippet,
        signature: sig,
        role: method.role ?? null,
        description: method.description ?? null,
    });
}
