import { createRequire } from "module";
import fs from "fs";
import path from "path";
import type { Task } from "../services/tasks";

// Chemin vers lolve-cartography (configurable via LC_PATH dans .env)
const LC_PATH = process.env.LC_PATH ?? "C:/lolve-cartography";

const require = createRequire(import.meta.url);
const { buildCallGraph } = require(`${LC_PATH}/lib/call-graph.cjs`) as {
    buildCallGraph: (srcPath: string, knownClasses: Set<string>) => Record<string, string[]>;
};

export type AgentContext = {
    task: { id: string; title: string };
    symbolMap: Record<string, string[]>;
    callGraph: Record<string, string[]>;
    prompt: string;
};

/**
 * Lit le method-index.json produit par lolve-cartography et construit le Symbol Map.
 * Si l'index n'existe pas, retourne un map vide (graceful degradation).
 */
function loadSymbolMap(projectRoot: string): Record<string, string[]> {
    const indexPath = path.join(projectRoot, ".cache", "method-index.json");
    try {
        const raw = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        const methods: Record<string, { isPrivate?: boolean; signature?: string }> = raw.methods ?? {};
        const map: Record<string, string[]> = {};
        for (const [key, method] of Object.entries(methods)) {
            if (method.isPrivate) continue;
            const cls = key.split(".")[0];
            if (!map[cls]) map[cls] = [];
            map[cls].push(method.signature ?? key.split(".")[1]);
        }
        return map;
    } catch {
        return {};
    }
}

/**
 * Assemble le contexte agent pour une tâche donnée.
 * @param task  - La tâche sélectionnée (id + title)
 * @param projectRoot - Racine du projet cible analysé par lolve-cartography
 */
export function buildContext(task: Pick<Task, "id" | "title">, projectRoot: string): AgentContext {
    const symbolMap = loadSymbolMap(projectRoot);
    const knownClasses = new Set(Object.keys(symbolMap));

    const srcPath = path.join(projectRoot, "src");
    const callGraph = knownClasses.size > 0
        ? buildCallGraph(srcPath, knownClasses)
        : {};

    const prompt = formatPrompt(task.title, symbolMap, callGraph);

    return {
        task: { id: task.id, title: task.title },
        symbolMap,
        callGraph,
        prompt
    };
}

function formatPrompt(
    taskTitle: string,
    symbolMap: Record<string, string[]>,
    callGraph: Record<string, string[]>
): string {
    const lines: string[] = [];

    lines.push("TASK");
    lines.push(taskTitle);
    lines.push("");
    lines.push("OBJECTIF");
    lines.push("Créer un plan pour réaliser la tâche ci-dessus.");
    lines.push("");

    if (Object.keys(symbolMap).length > 0) {
        lines.push("SYMBOL MAP");
        for (const [cls, sigs] of Object.entries(symbolMap).sort()) {
            lines.push(cls);
            for (const sig of sigs) lines.push(`  ${sig}`);
        }
        lines.push("");
    }

    if (Object.keys(callGraph).length > 0) {
        lines.push("CALL GRAPH");
        for (const [caller, callees] of Object.entries(callGraph).sort()) {
            lines.push(caller);
            for (const c of callees.slice(0, 5)) lines.push(`  → ${c}`);
        }
        lines.push("");
    }

    return lines.join("\n");
}
