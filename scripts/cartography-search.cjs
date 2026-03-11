'use strict';

const STOP_WORDS = new Set([
    'dans', 'avec', 'pour', 'sans', 'sous', 'vers', 'chez', 'entre', 'depuis',
    'avant', 'apres', 'selon', 'parmi', 'cette', 'cela', 'ceci', 'leur', 'leurs',
    'dont', 'mais', 'donc', 'ainsi', 'comme', 'puis', 'aussi',
    'avoir', 'etre', 'faire', 'mettre', 'prendre', 'tenir',
]);

/**
 * Wrapper de recherche lolve-cartography
 * Utilise la version dev de lolve-cartography (CARTOGRAPHY_PATH)
 * dont le cache pointe sur LC_PROJECT_PATH/.cache
 *
 * Usage : node scripts/cartography-search.cjs "query"
 * Env   : LC_PROJECT_PATH, CARTOGRAPHY_PATH
 * Output: JSON sur stdout
 */

// Rediriger les logs vers stderr pour ne pas polluer le JSON
const _log = (...a) => process.stderr.write(a.join(' ') + '\n');
console.log = _log;
console.warn = _log;
console.info = _log;
const _write = process.stdout.write.bind(process.stdout);
// On restaure stdout.write uniquement pour notre JSON final
process.stdout.write = (...a) => process.stderr.write(...a);

const query = process.argv[2];
if (!query) {
    _write(JSON.stringify({ error: 'Query manquant' }));
    process.exit(1);
}

const fs   = require('fs');
const path = require('path');

function grepProject(projectPath, query) {
    const hits    = [];
    const exts    = new Set(['.js', '.cjs', '.mjs', '.vue', '.ts', '.tsx', '.svelte']);

    // ── Liste des dossiers ignorés ─────────────────────────────────────────
    // Défaut global + dossiers spécifiques passés via LC_IGNORE_DIRS (JSON array)
    const ignored = new Set([
        'node_modules', 'dist', '.cache', '.git', '.backups', '.idea',
        // Extensions globales pour SvelteKit, Next, etc.
        '.svelte-kit', 'build', 'coverage', '.next', '__pycache__', 'out', '.turbo', '.vercel'
    ]);
    try {
        const extra = JSON.parse(process.env.LC_IGNORE_DIRS || '[]');
        if (Array.isArray(extra)) extra.forEach(d => ignored.add(String(d)));
    } catch { /* env invalide */ }

    // .claudignore depuis la racine du projet
    try {
        const claudignorePath = path.join(projectPath, '.claudignore');
        if (fs.existsSync(claudignorePath)) {
            fs.readFileSync(claudignorePath, 'utf-8')
                .split('\n')
                .map(l => l.trim())
                .filter(l => l && !l.startsWith('#'))
                .forEach(l => ignored.add(l));
        }
    } catch { /* inaccessible */ }

    // ── Filtre commentaires-seulement ──────────────────────────────────────
    // Si le mot-clé cherché figure dans LC_COMMENT_ONLY_KEYWORDS, on ne garde
    // que les lignes qui sont des commentaires (// # * /*).
    const commentOnlyKeywords = new Set();
    try {
        const kws = JSON.parse(process.env.LC_COMMENT_ONLY_KEYWORDS || '[]');
        if (Array.isArray(kws)) kws.forEach(k => commentOnlyKeywords.add(String(k).toLowerCase()));
    } catch { /* env invalide */ }

    const words  = [...new Set(
        query.toLowerCase()
            .split(/\s+/)
            .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
    )];
    const requireComment = words.some(w => commentOnlyKeywords.has(w))
        || commentOnlyKeywords.has(query.toLowerCase().trim());

    function isComment(line) {
        const t = line.trimStart();
        return t.startsWith('//') || t.startsWith('#') || t.startsWith('*') || t.startsWith('/*');
    }

    if (words.length === 0) return [];

    // Cache des regexes avec word boundary pour éviter "chat" dans "catch"
    const wordRegexes = Object.fromEntries(
        words.map(w => [w, new RegExp(`\\b${w}\\b`, 'i')])
    );

    function walk(dir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return; }
        for (const e of entries) {
            if (e.isDirectory()) {
                if (!ignored.has(e.name)) walk(path.join(dir, e.name));
            } else if (e.isFile() && exts.has(path.extname(e.name))) {
                const abs = path.join(dir, e.name);
                try {
                    const lines = fs.readFileSync(abs, 'utf-8').split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        if (words.some(w => wordRegexes[w].test(lines[i]))) {
                            if (requireComment && !isComment(lines[i])) continue;
                            hits.push({
                                file:    path.relative(projectPath, abs).replace(/\\/g, '/'),
                                line:    i + 1,
                                content: lines[i].trim()
                            });
                        }
                    }
                } catch { /* inaccessible */ }
            }
        }
    }
    walk(projectPath);
    return hits;
}

const projectPath  = process.env.LC_PROJECT_PATH  || 'C:/lolve';
const cartoPath    = process.env.CARTOGRAPHY_PATH || 'C:/lolve-cartography';

process.env.LC_PROJECT_PATH = projectPath;

_log(`[search] LC_PROJECT_PATH = ${process.env.LC_PROJECT_PATH}`);
_log(`[search] CARTOGRAPHY_PATH = ${cartoPath}`);
_log(`[search] index attendu = ${path.join(projectPath, '.cache/method-index.json')}`);

try {
    const { MethodIndexer, AnnotationCache } = require(path.join(cartoPath, 'lib/mcp/method-indexer.cjs'));
    const { MethodSearch }                    = require(path.join(cartoPath, 'lib/context/method-search.cjs'));

    const indexer = new MethodIndexer();
    indexer.loadIndex();

    const methodCount = Object.keys(indexer.index.methods || {}).length;
    const firstKeys = Object.keys(indexer.index.methods || {}).slice(0, 3);
    _log(`[search] ${methodCount} méthodes chargées. Premières clés : ${firstKeys.join(', ')}`);
    if (methodCount === 0) {
        _write(JSON.stringify({ error: 'Index vide — lance annotate index sur le projet' }));
        process.exit(1);
    }

    const cache = new AnnotationCache();
    cache.load();

    const search  = new MethodSearch(indexer, cache);
    const hits    = search.findRelevantMethods(query, { maxMethods: 12, minScore: 2, excludeRoles: [] });
    const methods = indexer.index.methods || {};

    const results = hits.map(r => {
        const meta = methods[r.key] || {};

        _log(`[meta] ${r.key} → file=${meta.file} startLine=${meta.startLine} endLine=${meta.endLine}`);

        let codeSnippet = null;
        let snippetError = null;

        if (meta.file && meta.startLine && meta.endLine) {
            try {
                const filePath = path.isAbsolute(meta.file)
                    ? meta.file
                    : path.join(projectPath, meta.file);
                const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
                codeSnippet = lines.slice(meta.startLine - 1, meta.endLine).join('\n');
            } catch (e) {
                snippetError = e.message;
                _log(`[snippet error] ${r.key}: ${e.message}`);
            }
        } else if (meta.file) {
            // Fallback : startLine absent — localiser la méthode par son nom dans le fichier
            try {
                const filePath = path.isAbsolute(meta.file)
                    ? meta.file
                    : path.join(projectPath, meta.file);
                const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
                const shortName = r.key.includes('.') ? r.key.split('.').pop() : r.key;
                const idx = lines.findIndex(l => l.includes(shortName));
                if (idx !== -1) {
                    codeSnippet = lines.slice(idx, Math.min(idx + 25, lines.length)).join('\n');
                    _log(`[snippet fallback] ${r.key}: trouvé ligne ${idx + 1}`);
                } else {
                    snippetError = `"${shortName}" non trouvé dans ${path.basename(meta.file)}`;
                    _log(`[no snippet] ${r.key}: ${snippetError}`);
                }
            } catch (e) {
                snippetError = e.message;
                _log(`[snippet error fallback] ${r.key}: ${e.message}`);
            }
        } else {
            snippetError = 'Fichier non référencé dans l\'index';
            _log(`[no snippet] ${r.key}: no file`);
        }

        return {
            key:         r.key,
            file:        meta.file || '',
            startLine:   meta.startLine || null,
            endLine:     meta.endLine   || null,
            score:       r.score,
            role:        r.role || meta.role || '',
            summary:     r.summary || meta.description || meta.summary || '',
            codeSnippet,
            snippetError,
            _raw: { file: meta.file, startLine: meta.startLine, endLine: meta.endLine, role: meta.role }
        };
    });

    const grepResults = grepProject(projectPath, query);
    _log(`[search] grep: ${grepResults.length} occurrences`);

    // Méthodes dont le code contient une occurrence grep (croisement fichier+ligne)
    const grepMethodKeys = new Set();
    for (const hit of grepResults) {
        for (const [key, meta] of Object.entries(methods)) {
            if (!meta.file || !meta.startLine || !meta.endLine) continue;
            // Normaliser meta.file en chemin relatif depuis projectPath
            const rel = path.isAbsolute(meta.file)
                ? path.relative(projectPath, meta.file).replace(/\\/g, '/')
                : meta.file.replace(/\\/g, '/');
            if (rel === hit.file && hit.line >= meta.startLine && hit.line <= meta.endLine) {
                grepMethodKeys.add(key);
            }
        }
    }
    _log(`[search] méthodes contenant l'occurrence: ${grepMethodKeys.size}`);

    const grepMethods = [...grepMethodKeys].map(key => {
        const meta = methods[key] || {};
        let codeSnippet = null;
        if (meta.file && meta.startLine && meta.endLine) {
            try {
                const filePath = path.isAbsolute(meta.file) ? meta.file : path.join(projectPath, meta.file);
                const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
                codeSnippet = lines.slice(meta.startLine - 1, meta.endLine).join('\n');
            } catch { /* inaccessible */ }
        }
        const relFile = path.isAbsolute(meta.file || '')
            ? path.relative(projectPath, meta.file).replace(/\\/g, '/')
            : (meta.file || '').replace(/\\/g, '/');
        return {
            key,
            file:        relFile,
            startLine:   meta.startLine || null,
            endLine:     meta.endLine   || null,
            score:       null,
            role:        meta.role || '',
            summary:     meta.description || meta.summary || '',
            codeSnippet,
            snippetError: codeSnippet ? null : 'non disponible',
            _raw: { file: meta.file, startLine: meta.startLine, endLine: meta.endLine, role: meta.role }
        };
    });

    _write(JSON.stringify({ results, grepResults, grepMethods }));
} catch (err) {
    _write(JSON.stringify({ error: err.message }));
    process.exit(1);
}
