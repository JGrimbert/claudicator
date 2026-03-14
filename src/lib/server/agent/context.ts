import type { Task } from "../services/tasks";
import { formatPrompt, loadConceptMap, loadProjectDocs } from "./prompt";
import { searchMethods, getSessionWithCode, generateAtlasStrings } from "../services/cartography";

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

const SNIPPET_MAX_LINES = 20;

/** Tronque un snippet au-delà de SNIPPET_MAX_LINES pour limiter le bruit dans le prompt. */
function truncateSnippet(code: string): string {
    const lines = code.split("\n");
    if (lines.length <= SNIPPET_MAX_LINES) return code;
    return lines.slice(0, SNIPPET_MAX_LINES).join("\n") + `\n// ... +${lines.length - SNIPPET_MAX_LINES} lignes`;
}

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
            snippet:     truncateSnippet(r.code!),
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
/**
 * Construit une query enrichie pour searchMethods.
 * Combine le titre de la task avec les 250 premiers caractères de la description
 * pour améliorer le matching sémantique (les titres en français matchent mal seuls).
 */
function buildQuery(title: string, description?: string): string {
    if (!description) return title;
    const extra = description.replace(/\n+/g, " ").trim().slice(0, 250);
    return `${title} ${extra}`;
}

/** Assemble le contexte agent complet pour une tâche donnée. */
export function buildContext(
    task: Pick<Task, "id" | "title">,
    projectRoot: string,
    description?: string
): AgentContext {
    const query     = buildQuery(task.title, description);
    const symbolMap = loadSymbolMap(projectRoot, query);
    const ctx: AgentContext = {
        task: { id: task.id, title: task.title },
        symbolMap,
        prompt: "",
    };

    const conceptMap  = loadConceptMap(projectRoot) ?? undefined;
    const projectDocs = loadProjectDocs(projectRoot);
    const atlas       = generateAtlasStrings(projectRoot, query)?.compressed;
    ctx.prompt = formatPrompt(ctx, { description, conceptMap, projectDocs, atlas });

    return ctx;
}
