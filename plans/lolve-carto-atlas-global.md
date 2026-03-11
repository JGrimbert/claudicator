# Plan : Code Atlas + Dependency Atlas Generator (lolve-cartography)

## 1. Analyse du problème

### État actuel

lolve-cartography est un outil d'indexation AST sophistiqué centré sur les méthodes individuelles.
Il produit :
- `.cache/method-index.json` (125 KB) — index granulaire par méthode
- `.cache/file-index.json` — catégorisation des fichiers
- `.cache/project-diagram.md` — diagramme UML textuel

### Manques identifiés

| Besoin | État actuel |
|--------|-------------|
| Repo Map hiérarchique lisible | absent |
| Atlas compressé (~30-50 lignes) | absent |
| Dependency Atlas structuré | partiel (call-graph.cjs non exposé en markdown) |
| Classe Atlas centrale | absent |
| Artefacts dans `/ai/` | absent |

### Style de classe demandé

Style "biblio-attribute" = attributs courts et sémantiques, comme Biblio, Vertex, Peri, Unda.
La classe Atlas doit ressembler à :

```
Atlas {
  repo   // arborescence des dossiers/fichiers
  syms   // classes + méthodes + fonctions
  calls  // call graph  { 'Class.method': ['dep1', 'dep2'] }
  mods   // dépendances inter-modules  { 'file-a.cjs': ['./file-b.cjs'] }
  meta   // timestamp, version, root
}
```

---

## 2. Localisation des usages

### Fichiers existants à réutiliser (sans modification)

| Fichier | Usage dans Atlas |
|---------|-----------------|
| `lib/call-graph.cjs` | Alimente `Atlas.calls` — format déjà compatible |
| `lib/mcp/method-indexer.cjs` | Alimente `Atlas.syms` via `.indexAll()` |
| `lib/context/file-analyzer.cjs` | Alimente `Atlas.repo` (catégories, keywords) |
| `lib/utils/file-utils.cjs` | `writeJSON`, `writeFile`, `listFiles` |
| `lib/utils/config-loader.cjs` | `loadProjectConfig`, `detectSourcePath` |
| `lib/utils/logger.cjs` | Logging uniforme |

### Fichiers à créer

| Fichier | Rôle |
|---------|------|
| `lib/atlas.cjs` | Classe Atlas (modèle de données) |
| `lib/atlas-generator.cjs` | Orchestrateur — construit et exporte l'Atlas |
| `lib/atlas-formatter.cjs` | 3 formatters markdown |

### Fichier à modifier

| Fichier | Modification |
|---------|-------------|
| `bin/cli.cjs` | Ajouter commande `atlas` |

### Sorties générées dans le projet analysé

```
/ai/
  repo-map.md
  atlas.compressed.md
  atlas.dependencies.md
  atlas.symbols.json     (optionnel)
  atlas.graph.json       (optionnel)
```

---

## 3. Stratégie de remplacement

**Aucun remplacement** — extension additive pure.

- Les fichiers existants restent intacts
- `call-graph.cjs` et `method-indexer.cjs` sont appelés sans modification
- Les sorties `/ai/*.md` s'ajoutent aux `.cache/*.json` existants
- La commande `atlas` s'ajoute aux commandes `annotate` existantes

**Aucune migration** — les nouvelles sorties dans `/ai/` sont indépendantes du cache existant.

---

## 4. Étapes de modification du code

### Step 1 — Créer `lib/atlas.cjs` (classe modèle)

Classe Atlas avec attributs biblio-attribute :

```
class Atlas {
  constructor()
    this.repo  = { dirs: [], files: [] }
    this.syms  = { classes: {}, methods: {}, fns: {} }
    this.calls = {}
    this.mods  = {}
    this.meta  = { generated: null, version: '1', root: null }

  fromMethodIndex(methodIndex)   // Charge syms depuis method-index.json
  fromCallGraph(callGraph)       // Charge calls depuis buildCallGraph()
  fromFileIndex(fileIndex)       // Charge repo + mods depuis file-index.json
  toJSON()                       // Sérialisation complète
}
```

**Format de `syms` :**
```json
{
  "classes": {
    "MethodIndexer": {
      "file": "lib/mcp/method-indexer.cjs",
      "methods": ["loadIndex", "indexAll", "indexFile"]
    }
  },
  "methods": {
    "MethodIndexer.indexAll": {
      "signature": "indexAll(options)",
      "role": "core"
    }
  },
  "fns": {}
}
```

**Format de `mods` :**
```json
{
  "lib/atlas-generator.cjs": [
    "lib/atlas.cjs",
    "lib/atlas-formatter.cjs",
    "lib/call-graph.cjs"
  ]
}
```

---

### Step 2 — Créer `lib/atlas-generator.cjs` (orchestrateur)

```
class AtlasGenerator {
  constructor(root, options)

  generate()            // Pipeline complet → écrit les fichiers /ai/
  buildRepo(root)       // Scan arborescence → Atlas.repo
  buildSyms(root)       // MethodIndexer.indexAll() → Atlas.syms
  buildCalls(root)      // buildCallGraph(root) → Atlas.calls
  buildMods(root)       // Scan ImportDeclaration AST → Atlas.mods
  scoreNodes(atlas)     // importance = nb_appels_entrants + sortants
  writeArtifacts(atlas) // Écrit les fichiers dans /ai/
}
```

**buildRepo** : `listFiles(srcPath)` → construire arborescence imbriquée.

**buildMods** : parcourir chaque fichier, traverser `ImportDeclaration`, résoudre chemin relatif → `{ fileA: [fileB, fileC] }`.

**scoreNodes** : pour chaque nœud du call graph, compter `in-degree + out-degree` → score d'importance. Trier dans l'Atlas de dépendances.

**writeArtifacts** :
1. Créer `/ai/` si absent (`fs.mkdirSync(..., { recursive: true })`)
2. Appeler `repoMapFormatter` → écrire `repo-map.md`
3. Appeler `compressedFormatter` → écrire `atlas.compressed.md`
4. Appeler `dependencyFormatter` → écrire `atlas.dependencies.md`
5. Si `options.json` : écrire `atlas.symbols.json` et `atlas.graph.json`

---

### Step 3 — Créer `lib/atlas-formatter.cjs` (3 formatters)

#### repoMapFormatter(atlas)

Sortie `/ai/repo-map.md` :
```
REPO MAP

lib/
  mcp/
    method-indexer.cjs
    context-agent.cjs
  context/
    file-analyzer.cjs
    method-search.cjs
  utils/
    logger.cjs
bin/
  cli.cjs
```
Règles : pas de prose, indentation 2 espaces, trier par ordre alphabétique dans chaque dossier.

#### compressedFormatter(atlas)

Sortie `/ai/atlas.compressed.md` :
```
SYSTEM
[description 1 ligne du projet]

MODULES
[liste des modules principaux avec rôle]

API

class ClassName
  method1(params)
  method2()

class OtherClass
  method3()

FLOW

ClassName.entry →
  method1
  method2

OtherClass.method3 →
  ClassName.method1
```
Règles : max 50 lignes, uniquement rôles `entry` et `core` dans FLOW, lignes courtes.

#### dependencyFormatter(atlas)

Sortie `/ai/atlas.dependencies.md` :
```
DEPENDENCY ATLAS

[nodes triés par score décroissant]

MethodIndexer.indexAll (score: 12)
  -> indexFile
  -> hashContent

AtlasGenerator.generate (score: 8)
  -> buildRepo
  -> buildSyms
  -> buildCalls

MODULE DEPS

lib/atlas-generator.cjs
  -> lib/atlas.cjs
  -> lib/call-graph.cjs
```
Règles : `->` pour les arêtes, score entre parenthèses, séparation MODULE DEPS en bas.

---

### Step 4 — Modifier `bin/cli.cjs`

Ajouter le bloc de commande `atlas` dans le switch/if principal :

```
lolve-cartography atlas                    # Génère tous les artefacts
lolve-cartography atlas --no-json          # Sans atlas.symbols.json et atlas.graph.json
lolve-cartography --project /path atlas   # Sur projet externe
```

Entrée dans la help :
```
atlas      Generate AI-friendly Atlas artifacts in /ai/
```

---

### Step 5 — Créer le dossier `/ai/` dans le projet analysé

`AtlasGenerator.writeArtifacts()` crée le dossier avec `fs.mkdirSync(aiDir, { recursive: true })`.

**Recommandation .gitignore** : ajouter `/ai/` au `.gitignore` du projet analysé, comme `.cache/` (documentation générée, pas sourcée).

---

### Step 6 — Fichiers JSON optionnels (flag `--json`, activé par défaut)

- `/ai/atlas.symbols.json` → dump de `Atlas.syms`
- `/ai/atlas.graph.json` → dump de `{ calls: Atlas.calls, mods: Atlas.mods }`

---

## 5. Vérifications et nettoyage final

### Fonctionnement

1. `lolve-cartography atlas --project /path/to/lolve` génère les 3 fichiers dans `/path/to/lolve/ai/`
2. `lolve-cartography annotate full` continue de fonctionner sans changement
3. `lolve-cartography atlas` sans `--project` fonctionne sur le projet courant
4. Le dossier `/ai/` est créé automatiquement si absent

### Contenu des artefacts

5. `repo-map.md` : hiérarchie lisible, lignes < 80 chars, pas de prose
6. `atlas.compressed.md` : ≤ 50 lignes, classes + signatures + flows
7. `atlas.dependencies.md` : graphe style `->`, scores visibles, nœuds triés

### Régressions à éviter

8. Ne pas modifier la signature de `buildCallGraph()` dans `call-graph.cjs`
9. Ne pas toucher au format de `method-index.json` (125 KB, utilisé par MCP)
10. Pas de nouvelle dépendance npm — utiliser uniquement acorn + existant
11. Ne pas casser le pipeline `annotate full`

### Nettoyage final

12. Mettre à jour `README.md` et `README.fr.md` — ajouter section commande `atlas`
13. Tester la commande sur lolve-cartography lui-même (auto-cartographie)
14. Vérifier que les fichiers `/ai/` sont lisibles par un LLM sans contexte supplémentaire

---

## Résumé des fichiers touchés

| Fichier | Action |
|---------|--------|
| `lib/atlas.cjs` | CRÉER — classe Atlas (modèle) |
| `lib/atlas-generator.cjs` | CRÉER — orchestrateur |
| `lib/atlas-formatter.cjs` | CRÉER — 3 formatters markdown |
| `bin/cli.cjs` | MODIFIER — ajouter commande `atlas` |
| `README.md` | MODIFIER — documenter commande `atlas` |
| `README.fr.md` | MODIFIER — documenter commande `atlas` |
| `lib/call-graph.cjs` | INCHANGÉ — réutilisé tel quel |
| `lib/mcp/method-indexer.cjs` | INCHANGÉ — réutilisé tel quel |
| `lib/context/file-analyzer.cjs` | INCHANGÉ — réutilisé tel quel |
