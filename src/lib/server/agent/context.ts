import type { Task } from "../services/tasks";
import { formatPrompt, loadConceptMap, loadProjectDocs } from "./prompt";
import { searchMethods, getSessionWithCode } from "../services/cartography";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MethodSnippet = {
    key:         string;
    file:        string;
    startLine:   number;
    endLine:     number;
    snippet:     string;
    signature:   string;
    role:        string | null;
    description: string | null;
};

export type SymbolGroup = { file?: string; sigs: string[] };

export type AgentContext = {
    task:      { id: string; title: string };
    symbolMap: Record<string, SymbolGroup>;
    prompt:    string;
};

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Charge les snippets de code pour la query donnée.
 * Utilise lolve-cartography (MethodSearch + extractMethodCode via AST)
 * au lieu de la lecture directe du JSON d'index + brace-matching.
 */
export function loadMethodSnippets(projectRoot: string, query: string): MethodSnippet[] {
    return getSessionWithCode(query, projectRoot)
        .filter(r => r.code)
        .map(r => ({
            key:         r.key,
            file:        r.file,
            startLine:   r.startLine,
            endLine:     r.endLine,
            snippet:     r.code!,
            signature:   r.signature,
            role:        r.role,
            description: r.description,
        }));
}

/**
 * Retourne le symbol map pour la query donnée.
 * Utilise MethodSearch de lolve-cartography (scoring natif)
 * au lieu du scoring manuel (scoreSymbol / camelParts / fileParts).
 */
export function loadSymbolMap(projectRoot: string, query: string): Record<string, SymbolGroup> {
    const hits = searchMethods(query, projectRoot);
    if (!hits.length) return {};

    const map: Record<string, SymbolGroup> = {};
    for (const { key, method } of hits) {
        const parts = key.split(".");
        const cls   = parts.length > 1 ? parts[0] : key;
        const sig   = method.signature ?? parts.at(-1) ?? key;
        if (!map[cls]) map[cls] = { file: method.file, sigs: [] };
        if (!map[cls].sigs.includes(sig)) map[cls].sigs.push(sig);
    }
    return map;
}

/**
 * Assemble le contexte agent pour une tâche donnée.
 * @param task        - La tâche sélectionnée (id + title)
 * @param projectRoot - Racine du projet cible analysé par lolve-cartography
 * @param description - Corps de l'issue GitHub associée (optionnel)
 */
export function buildContext(
    task: Pick<Task, "id" | "title">,
    projectRoot: string,
    description?: string
): AgentContext {
    const symbolMap = loadSymbolMap(projectRoot, task.title);
    const ctx: AgentContext = {
        task: { id: task.id, title: task.title },
        symbolMap,
        prompt: "",
    };

    const conceptMap  = loadConceptMap(projectRoot) ?? undefined;
    const projectDocs = loadProjectDocs(projectRoot);
    ctx.prompt = formatPrompt(ctx, { description, conceptMap, projectDocs });

    return ctx;
}
