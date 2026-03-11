Maintenant je génère le plan et le sauvegarde.
Plan sauvegardé dans `plans/lolve-carto-atlas-global.md`.

---

## Plan : Code Atlas + Dependency Atlas (lolve-cartography)

### 1. Analyse du problème

lolve-cartography possède déjà de solides fondations AST (MethodIndexer, CallGraph, FileAnalyzer), mais il manque des artefacts AI-friendly à haut niveau :

| Besoin | État actuel |
|--------|-------------|
| Repo Map hiérarchique | absent |
| Atlas compressé 30-50 lignes | absent |
| Dependency Atlas en markdown | absent (call-graph.cjs non exposé) |
| Classe Atlas centrale | absent |
| Dossier `/ai/` | absent |

**Style de classe demandé** — biblio-attribute, court et sémantique :
```
Atlas { repo, syms, calls, mods, meta }
```

---

### 2. Localisation des usages

**Réutilisés sans modification :**
- `lib/call-graph.cjs` → alimente `Atlas.calls`
- `lib/mcp/method-indexer.cjs` → alimente `Atlas.syms`
- `lib/context/file-analyzer.cjs` → alimente `Atlas.repo`
- `lib/utils/file-utils.cjs`, `config-loader.cjs`, `logger.cjs`

**À créer :**
- `lib/atlas.cjs` — modèle
- `lib/atlas-generator.cjs` — orchestrateur
- `lib/atlas-formatter.cjs` — 3 formatters

**À modifier :**
- `bin/cli.cjs` — ajouter commande `atlas`

---

### 3. Stratégie de remplacement

**Aucun remplacement** — extension additive pure. Les caches existants (`.cache/*.json`) et les commandes `annotate` restent intacts. Les sorties `/ai/*.md` sont indépendantes.

---

### 4. Étapes de modification du code

**Step 1 — `lib/atlas.cjs`**
Classe avec attributs courts :
```js
class Atlas {
  repo   // { dirs, files }
  syms   // { classes, methods, fns }
  calls  // { 'Class.method': ['dep1'] }
  mods   // { 'file-a.cjs': ['./file-b.cjs'] }
  meta   // { generated, version, root }
  
  fromMethodIndex(idx)
  fromCallGraph(graph)
  fromFileIndex(idx)
  toJSON()
}
```

**Step 2 — `lib/atlas-generator.cjs`**
Orchestrateur qui :
1. `buildRepo()` → scan arborescence
2. `buildSyms()` → MethodIndexer.indexAll()
3. `buildCalls()` → buildCallGraph()
4. `buildMods()` → scan `ImportDeclaration` AST
5. `scoreNodes()` → importance = in-degree + out-degree
6. `writeArtifacts()` → crée `/ai/`, écrit les 3 `.md`

**Step 3 — `lib/atlas-formatter.cjs`**
- `repoMapFormatter` → `/ai/repo-map.md` (arborescence indentée, sans prose)
- `compressedFormatter` → `/ai/atlas.compressed.md` (≤ 50 lignes, SYSTEM/MODULES/API/FLOW)
- `dependencyFormatter` → `/ai/atlas.dependencies.md` (graphe `->`, scores, MODULE DEPS)

**Step 4 — `bin/cli.cjs`**
Ajouter `atlas` / `atlas --no-json` / `--project /path atlas`

**Step 5 — Création de `/ai/`**
`fs.mkdirSync(aiDir, { recursive: true })` dans `writeArtifacts()`

**Step 6 — JSON optionnels** (`--json` activé par défaut)
- `/ai/atlas.symbols.json` → dump `Atlas.syms`
- `/ai/atlas.graph.json` → dump `{ calls, mods }`

---

### 5. Vérifications et nettoyage final

1. `lolve-cartography atlas --project /path/to/lolve` génère les 3 fichiers
2. `lolve-cartography annotate full` continue sans changement
3. `method-index.json` et son format restent intacts (utilisé par MCP)
4. Aucune nouvelle dépendance npm
5. Mettre à jour `README.md` et `README.fr.md`
6. Tester en auto-cartographie sur lolve-cartography lui-même