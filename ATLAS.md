# Atlas — Claudicator
_Généré pour : Issue #253 — useAtlas_

## Points d'entrée (issue #253)

Ces symboles ont été identifiés comme pertinents :

| Symbole | Fichier | Signature |
|---|---|---|
| `generateAtlasStrings` | `src/lib/server/services/cartography.ts` | `generateAtlasStrings(projectRoot, query)` |
| `formatImplementationPrompt` | `src/lib/server/agent/prompt.ts` | `formatImplementationPrompt(task, plan, methods, docs, atlas)` |
| `searchMethods` | `src/lib/server/services/cartography.ts` | `searchMethods(query, projectRoot)` |

---

## Snippets

### `generateAtlasStrings`
_src/lib/server/services/cartography.ts_

```ts
function generateAtlasStrings(
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
```

### `formatImplementationPrompt`
_src/lib/server/agent/prompt.ts_

```ts
function formatImplementationPrompt(
    task: { title: string },
    plan: string,
    methods: MethodSnippet[],
    docs?: ProjectDocs,
    atlas?: string
): string {
    const lines: string[] = [];

    lines.push("TASK");
    lines.push(task.title);
    lines.push("");

    lines.push("OBJECTIF");
    lines.push("Implémenter le plan ci-dessous étape par étape. Modifier le code dans le projet.");
    lines.push("Ne pas produire de plan. Réaliser directement les modifications.");
    lines.push("");

    // ── Atlas architectural du projet cible ───────────────────────────────────
    if (atlas) {
        lines.push("useAtlas");
        lines.push("");
    }

    if (methods.length > 0) {
        lines.push("CODE PERTINENT");
        const byFile = new Map<string, MethodSnippet[]>();
        for (const m of methods) {
            if (!byFile.has(m.file)) byFile.set(m.file, []);
            byFile.get(m.file)!.push(m);
        }
        for (const [file, items] of byFile) {
            lines.push(`\n## ${file}`);
            for (const m of items) {
                lines.push(`### ${m.key}${m.description ? `  — ${m.description}` : ""}`);
                lines.push("```");
                lines.push(m.snippet);
                lines.push("```");
            }
        }
        lines.push("");
    }

    if (docs) {
        const docLines: string[] = [];
        for (const f of docs.agents) docLines.push(`- Agent expert : ${f}`);
        for (const f of docs.theoryFiles) docLines.push(`- Théorie : ${f}`);
        if (docLines.length > 0) {
            lines.push("DOCUMENTATION");
            lines.push(...docLines);
            lines.push("");
        }
    }

    lines.push("NAVIGATION CARTOGRAPHIE");
    lines.push("Les endpoints suivants permettent d'explorer le code du projet :");
    lines.push("POST /api/cartography { query }        → trouver des méthodes par sémantique");
    lines.push("GET  /api/cartography/snippet?key=...  → obtenir le code précis d'une méthode");
    lines.push("POST /api/cartography/refresh          → mettre à jour l'index après modification");
    lines.push("INTERDIT : ls -R, grep, find, cat pour naviguer le code source");
    lines.push("");

    lines.push("PLAN APPROUVÉ");
    lines.push(plan);

    return lines.join("\n");
}
```
