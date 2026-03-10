import { createRequire } from "module";
import path from "path";

const LC_PATH = process.env.LC_PATH ?? "C:/lolve-cartography";
const _require = createRequire(import.meta.url);

// ─── Singletons — initialisés au premier appel ────────────────────────────────
let _indexer:    any = null;
let _annotCache: any = null;
let _search:     any = null;
let _SearchSession: any = null;

export type MethodResult = {
    key:         string;
    file:        string;
    class:       string | null;
    signature:   string;
    role:        string | null;
    description: string | null;
    startLine:   number;
    endLine:     number;
    code:        string | null;
    score:       number;
};

/**
 * Initialise les singletons lolve-cartography au premier appel.
 * LC_PROJECT_PATH doit être défini avant le premier require pour que
 * CONFIG.rootPath (module-level dans method-indexer.cjs) soit correct.
 */
function ensureLoaded(projectRoot: string): void {
    if (_indexer !== null) return;

    const normalizedRoot = path.normalize(projectRoot);
    process.env.LC_PROJECT_PATH = normalizedRoot;

    const { MethodIndexer, AnnotationCache } = _require(`${LC_PATH}/lib/mcp/method-indexer.cjs`);
    const { MethodSearch }                    = _require(`${LC_PATH}/lib/context/method-search.cjs`);
    const { SearchSession }                   = _require(`${LC_PATH}/lib/context/search-session.cjs`);

    _indexer = new MethodIndexer();
    _indexer.loadIndex();

    _annotCache = new AnnotationCache();
    _annotCache.load();

    _search        = new MethodSearch(_indexer, _annotCache);
    _SearchSession = SearchSession;
}

/**
 * Recherche les méthodes pertinentes via MethodSearch (scoring natif lolve-cartography).
 * Remplace le scoring manuel (scoreSymbol / camelParts / fileParts) de context.ts.
 */
export function searchMethods(
    query:      string,
    projectRoot: string,
    maxMethods  = 15
): { key: string; method: any; score: number }[] {
    ensureLoaded(projectRoot);
    return _search.findRelevantMethods(query, {
        maxMethods,
        minScore:     2,
        excludeRoles: [],
        includePrivate: false,
    });
}

/**
 * Retourne les méthodes pertinentes avec leur code source extrait via AST
 * (MethodIndexer.extractMethodCode — précis, pas de brace-matching).
 * Utilisé pour remplacer loadMethodSnippets dans context.ts.
 */
export function getSessionWithCode(
    query:      string,
    projectRoot: string,
    maxMethods  = 15
): MethodResult[] {
    ensureLoaded(projectRoot);

    // Pseudo-agent minimal requis par SearchSession
    const agentLike = {
        rootPath:       path.normalize(projectRoot),
        methodIndexer:  _indexer,
        annotationCache: _annotCache,
        findRelevantMethods: (q: string, opts: any) =>
            _search.findRelevantMethods(q, opts),
    };

    const session = new _SearchSession(agentLike, query, {
        maxMethods,
        minScore:     2,
        excludeRoles: [],
        includePrivate: false,
    });

    const methodIndex: Record<string, any> = _indexer.index.methods ?? {};

    return (session.getAtLevel(3) as any[]).map((item: any): MethodResult => {
        const meta = methodIndex[item.key] ?? {};
        return {
            key:         item.key,
            file:        item.file  ?? meta.file  ?? "",
            class:       (item.class  ?? meta.class)  || null,
            signature:   item.signature ?? meta.signature ?? item.key,
            role:        (item.role  ?? meta.role)  || null,
            description: (item.description ?? meta.description) || null,
            startLine:   meta.line ?? meta.startLine ?? 0,
            endLine:     meta.endLine ?? 0,
            code:        item.code ?? null,
            score:       item.score ?? 0,
        };
    });
}

/**
 * Extrait le code source d'une méthode via AST (on-demand).
 * Délègue à MethodIndexer.extractMethodCode.
 */
export function getSnippet(key: string, projectRoot: string): string | null {
    ensureLoaded(projectRoot);
    return (_indexer.extractMethodCode(key) as string | null) ?? null;
}

/**
 * Remet à jour l'index des méthodes (MethodIndexer.indexAll, incrémental).
 * Recharge aussi le cache d'annotations.
 */
export function refreshIndex(
    projectRoot: string
): { updated: number; skipped: number; errors: number; deleted: number } {
    ensureLoaded(projectRoot);
    const result = _indexer.indexAll({ force: false }) as {
        updated: number; skipped: number; errors: number; deleted: number;
    };
    _annotCache.load();
    return result;
}
