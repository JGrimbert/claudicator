import { createRequire } from "module";
import path from "path";
import fs from "fs";

const LC_PATH = process.env.LC_PATH ?? "C:/lolve-cartography";
const _require = createRequire(import.meta.url);

// ─── Singletons — réinitialisés si projectRoot change ─────────────────────────
let _indexer:         any = null;
let _annotCache:      any = null;
let _search:          any = null;
let _SearchSession:   any = null;
let _depsCache:       string | null = null; // DÉPENDANCES statique, invalidé sur refreshIndex
let _currentRoot:     string | null = null;

/** Modules lolve-carto dont le CONFIG est lu au niveau module — à purger si projectRoot change. */
const LC_MODULES = [
    `${LC_PATH}/lib/mcp/method-indexer.cjs`,
    `${LC_PATH}/lib/context/method-search.cjs`,
    `${LC_PATH}/lib/context/search-session.cjs`,
    `${LC_PATH}/lib/annotation-manager.cjs`,
];

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
 * Initialise (ou réinitialise) les singletons lolve-cartography.
 *
 * method-indexer.cjs lit LC_PROJECT_PATH au niveau module (const CONFIG = ...).
 * Si projectRoot change, il faut purger le require cache pour forcer une
 * ré-exécution du module avec le bon LC_PROJECT_PATH.
 */
function ensureLoaded(projectRoot: string): void {
    const normalizedRoot = path.normalize(projectRoot);
    if (_indexer !== null && _currentRoot === normalizedRoot) return;

    // Purger le cache require pour les modules lolve-carto qui ont un CONFIG figé
    for (const mod of LC_MODULES) {
        try {
            const resolved = _require.resolve(mod);
            delete (_require as any).cache[resolved];
        } catch { /* module absent — ignorer */ }
    }

    _indexer = null;
    _annotCache = null;
    _search = null;
    _SearchSession = null;
    _depsCache = null;
    _currentRoot = normalizedRoot;

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
 * Sélection adaptative selon la qualité du score top-1.
 *
 *  score ≥ 6  → top 3  (très bon match, être sélectif)
 *  score ≥ 3  → top 5  (match correct)
 *  score ≥ 2  → top 2  (match faible, best-effort)
 *  0 résultats → []
 */
function adaptiveCap(hits: { score: number }[]): number {
    const top = hits[0]?.score ?? 0;
    if (top >= 6) return 3;
    if (top >= 3) return 5;
    return 2;
}

/**
 * Recherche les méthodes pertinentes via MethodSearch (scoring natif lolve-cartography).
 * Applique une sélection adaptative : le nombre de résultats dépend du score top-1.
 */
export function searchMethods(
    query:       string,
    projectRoot: string
): { key: string; method: any; score: number }[] {
    ensureLoaded(projectRoot);
    const hits = _search.findRelevantMethods(query, {
        maxMethods:   20,
        minScore:     2,
        excludeRoles: [],
        includePrivate: false,
    });
    return hits.slice(0, adaptiveCap(hits));
}

/**
 * Retourne les méthodes pertinentes avec leur code source extrait via AST
 * (MethodIndexer.extractMethodCode — précis, pas de brace-matching).
 * Applique la même sélection adaptative que searchMethods.
 */
export function getSessionWithCode(
    query:       string,
    projectRoot: string
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
        maxMethods:   20,
        minScore:     2,
        excludeRoles: [],
        includePrivate: false,
    });

    const methodIndex: Record<string, any> = _indexer.index.methods ?? {};

    const results = (session.getAtLevel(3) as any[]).map((item: any): MethodResult => {
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

    return results.slice(0, adaptiveCap(results));
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
 * Génère une vue compressée de l'architecture du projet cible.
 *
 * @param projectRoot - Racine du projet cible
 * @param query       - Titre de la task : filtre MODULES aux fichiers pertinents uniquement
 *
 * Deux sections :
 *  1. MODULES / CLASSES  — fichiers pertinents à la query (ou tous si absent)
 *  2. DÉPENDANCES        — imports entre fichiers (statique, caché)
 */
export function generateAtlasStrings(
    projectRoot: string,
    query?: string
): { compressed: string } | null {
    try {
        ensureLoaded(projectRoot);

        const index = _indexer.index as {
            methods: Record<string, any>;
            classes: Record<string, any>;
        };

        // MODULES : filtré par fichiers des méthodes pertinentes à la query
        let relevantFiles: Set<string> | undefined;
        if (query) {
            const hits = searchMethods(query, projectRoot);
            relevantFiles = new Set(
                hits.map(({ method }) => (method.file || '').split('\\').join('/'))
                    .filter(Boolean)
            );
            if (relevantFiles.size === 0) relevantFiles = undefined;
        }

        const parts: string[] = [];
        const modules = buildAtlasText(projectRoot, index, relevantFiles);
        if (modules) parts.push(modules);

        // DÉPENDANCES : statique, mise en cache
        if (!_depsCache) _depsCache = buildAtlasDeps(projectRoot) ?? '';
        if (_depsCache) parts.push(_depsCache);

        return parts.length > 0 ? { compressed: parts.join('\n') } : null;
    } catch {
        return null;
    }
}

// ─── Dépendances inter-fichiers ────────────────────────────────────────────────

/** Collecte tous les fichiers .ts/.svelte sous srcDir récursivement. */
function walkSrc(dir: string, out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walkSrc(full, out);
        else if (e.name.endsWith('.ts') || e.name.endsWith('.svelte')) out.push(full);
    }
    return out;
}

/**
 * Scanne les imports (relatifs + $lib/) et génère une section DÉPENDANCES.
 * - Lib files : liste leurs dépendances directes
 * - Routes API : groupées par premier segment, agrégation des services utilisés
 */
function buildAtlasDeps(projectRoot: string): string | null {
    const srcDir = path.join(projectRoot, 'src');
    const files  = walkSrc(srcDir);
    if (files.length === 0) return null;

    // file (relatif à projectRoot) → liste des imports
    const depMap: Record<string, string[]> = {};
    const importRe = /from\s+['"]([^'"]+)['"]/g;
    for (const f of files) {
        let content: string;
        try { content = fs.readFileSync(f, 'utf-8'); } catch { continue; }
        const deps: string[] = [];
        for (const m of content.matchAll(importRe)) deps.push(m[1]);
        if (deps.length > 0)
            depMap[path.relative(projectRoot, f).split('\\').join('/')] = deps;
    }

    const lines: string[] = ['DÉPENDANCES'];

    // ── Lib files ─────────────────────────────────────────────────────────────
    const libFiles = Object.keys(depMap)
        .filter(f => f.startsWith('src/lib/server/') && !f.includes('/components/'))
        .sort();

    for (const f of libFiles) {
        const deps = depMap[f].filter(d => d.startsWith('.') || d.startsWith('$lib/'));
        if (!deps.length) continue;
        // normaliser $lib/ → lib/server/...
        const normalized = deps.map(d =>
            d.startsWith('$lib/') ? d.replace('$lib/', 'lib/') : d
        );
        lines.push(f.replace('src/', ''));
        for (const d of normalized.slice(0, 5)) lines.push(`  → ${d}`);
        if (normalized.length > 5) lines.push(`  → ... +${normalized.length - 5} more`);
    }

    return lines.length > 1 ? lines.join('\n') : null;
}

/** Construit la section MODULES/CLASSES de l'atlas pour le prompt. */
function buildAtlasText(
    projectRoot: string,
    index: { methods: Record<string, any>; classes: Record<string, any> },
    relevantFiles?: Set<string>
): string | null {
    const methods = index.methods ?? {};
    const classes = index.classes ?? {};
    const lines: string[] = [];

    lines.push(`SYSTEM`);
    lines.push(path.basename(projectRoot));
    lines.push('');

    const hasClasses = Object.keys(classes).length > 0;

    if (hasClasses) {
        // ── Mode OOP : une section par classe ─────────────────────────────────
        lines.push('CLASSES');
        for (const [cls, data] of Object.entries(classes)) {
            const file = ((data as any).file || '').split('\\').join('/').replace(/^src\//, '');
            if (relevantFiles && !relevantFiles.has(((data as any).file || '').split('\\').join('/'))) continue;
            const meths: string[] = ((data as any).methods || []).slice(0, 5);
            lines.push(`${cls}  [${file}]`);
            for (const m of meths) lines.push(`  ${m}`);
            const total: number = ((data as any).methods || []).length;
            if (total > 5) lines.push(`  ... +${total - 5} more`);
        }
    } else {
        // ── Mode fonctionnel : lib séparé des routes ───────────────────────────
        const byFile = new Map<string, string[]>();
        for (const [key, m] of Object.entries(methods)) {
            if (m.isPrivate || !m.isExported) continue;
            const fp = (m.file || '').split('\\').join('/');
            if (!fp) continue;
            if (relevantFiles && !relevantFiles.has(fp)) continue; // ← filtre task
            if (!byFile.has(fp)) byFile.set(fp, []);
            byFile.get(fp)!.push(m.signature || key);
        }

        const libFiles:   string[] = [];
        const routeFiles: string[] = [];
        for (const fp of byFile.keys()) {
            if (fp.includes('/routes/api/')) routeFiles.push(fp);
            else if (!fp.includes('/routes/'))   libFiles.push(fp);
        }
        libFiles.sort();
        routeFiles.sort();

        if (libFiles.length > 0) {
            lines.push('MODULES');
            for (const f of libFiles) {
                const sigs = byFile.get(f)!;
                lines.push(f.replace(/^src\//, ''));
                for (const sig of sigs.slice(0, 5)) lines.push(`  ${sig}`);
                if (sigs.length > 5) lines.push(`  ... +${sigs.length - 5} more`);
            }
        }

        if (routeFiles.length > 0) {
            lines.push('');
            lines.push('API ROUTES');
            const paths = routeFiles
                .map(f => f.replace(/^src\/routes/, '').replace(/\/\+server\.ts$/, ''))
                .slice(0, 15);
            for (const rp of paths) lines.push(`  ${rp}`);
            if (routeFiles.length > 15) lines.push(`  ... +${routeFiles.length - 15} more`);
        }
    }

    return lines.length > 2 ? lines.join('\n') + '\n' : null;
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
    _depsCache = null; // invalider le cache DÉPENDANCES après re-indexation
    return result;
}
