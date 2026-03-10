import { json } from "@sveltejs/kit";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getTask } from "$lib/server/services/tasks";
import { getProjectRoot } from "$lib/server/services/projects";
import { loadSymbolMap } from "$lib/server/agent/context";

interface RawMethod {
    file?: string;
    startLine?: number;
    line?: number;       // alias utilisé par lolve-cartography
    endLine?: number;
    signature?: string;
    role?: string;
    description?: string;
    isPrivate?: boolean;
}

function extractSnippet(filePath: string, startLine: number, endLine?: number): string {
    if (!existsSync(filePath)) return "";
    const allLines = readFileSync(filePath, "utf-8").split("\n");
    const start = startLine - 1; // 0-indexé

    if (endLine && endLine > startLine) {
        return allLines.slice(start, endLine).join("\n");
    }

    // Comptage d'accolades pour trouver la fin de la méthode
    let depth = 0;
    let foundOpen = false;
    let endIdx = Math.min(start + 39, allLines.length - 1); // fallback 40 lignes

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

export async function GET({ params }) {
    const task = getTask(params.id);
    if (!task) return json({ error: "Task introuvable" }, { status: 404 });

    const root = getProjectRoot();
    const indexPath = join(root, ".cache/method-index.json");

    if (!existsSync(indexPath)) {
        return json({ error: "Cartographie non disponible" }, { status: 404 });
    }

    let allMethods: Record<string, RawMethod>;
    try {
        allMethods = JSON.parse(readFileSync(indexPath, "utf-8")).methods ?? {};
    } catch {
        return json({ error: "Index illisible" }, { status: 500 });
    }

    const symbolMap = loadSymbolMap(root, task.title);

    const methods: Array<{
        key: string;
        file: string;
        startLine: number;
        endLine: number;
        snippet: string;
        signature: string;
        role: string | null;
        description: string | null;
    }> = [];

    for (const [key, method] of Object.entries(allMethods)) {
        const startLine = method.startLine ?? method.line;
        if (!method.file || !startLine) continue;

        const parts = key.split(".");
        const cls = parts.length > 1 ? parts[0] : key;
        const sig = method.signature ?? parts.at(-1) ?? key;

        if (!symbolMap[cls] || !symbolMap[cls].sigs.includes(sig)) continue;

        const filePath = join(root, method.file);
        const snippet = extractSnippet(filePath, startLine, method.endLine);
        const endLine = method.endLine ?? startLine + snippet.split("\n").length - 1;

        methods.push({
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

    return json({ methods });
}
