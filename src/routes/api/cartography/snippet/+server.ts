import { json } from "@sveltejs/kit";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getProjectRoot } from "$lib/server/services/projects";

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
    const snippet = extractSnippet(filePath, startLine, method.endLine);
    const endLine = method.endLine ?? startLine + snippet.split("\n").length - 1;

    const parts = key.split(".");
    const sig = method.signature ?? parts.at(-1) ?? key;

    return json({
        key,
        file: method.file,
        startLine,
        endLine,
        snippet,
        signature: sig,
        role: method.role ?? null,
        description: method.description ?? null,
    });
}
