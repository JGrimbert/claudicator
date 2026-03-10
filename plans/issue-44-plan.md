Je vais d'abord explorer les fichiers clés pour produire un plan précis.
Maintenant, explorons lolve-cartography pour comprendre les ressources exposées.
Je continue à explorer `context-agent.cjs` et `search-session.cjs` pour comprendre les API disponibles.
Maintenant je vérifie les routes API existantes et la config du projet lolve.
J'ai maintenant tous les éléments pour produire le plan. Je sauvegarde également le plan dans `plans/` comme requis par CLAUDE.md.
---

# Plan — Context-Aware Provider (AST-Driven)

## 1. Analyse du problème

🔍 **Analyse de Graphe** : Nœuds `buildContext`, `loadSymbolMap`, `loadMethodSnippets` dans `context.ts`.

`context.ts` **duplique** ce que lolve-cartography fait nativement :

| Actuel (`context.ts`) | Natif (lolve-cartography) |
|---|---|
| Lit `method-index.json` directement (×3) | `MethodIndexer.loadIndex()` |
| Implémente `scoreSymbol()` manuellement | `MethodSearch.findRelevantMethods()` |
| Extrait snippets via `fs.readFileSync` | `MethodIndexer.extractMethodCode()` |
| Implémente `expandWithCallees()` | `SearchSession.expand()` |
| Lit `annotation-cache.json` via `loadAnnotCache()` | `AnnotationCache` dans `ContextAgent` |

Problème secondaire : pendant `/api/agent/run`, l'agent Claude n'a aucun accès structuré à lolve-cartography et utilise `ls`/`grep`/`find`.

---

## 2. Localisation des usages

🔍 **Analyse de Graphe** : consommateurs de `buildContext` et `loadSymbolMap`.

- `context.ts:20–35` — `extractSnippet()` : lecture fichier directe (redondant avec `/api/cartography/snippet`)
- `context.ts:121–126` — `loadAnnotCache()` : lit JSON directement (remplacé par `AnnotationCache`)
- `context.ts:169–213` — `loadSymbolMap()` : scoring manuel à remplacer par `MethodSearch`
- `context.ts:220–243` — `expandWithCallees()` : à remplacer par `SearchSession.expand()`
- `context.ts:251–280` — `buildContext()` : orchestrateur à refactorer sur `ContextAgent`
- `api/agent/run/+server.ts:36–39` — consomme `loadSymbolMap` + `loadMethodSnippets`
- `api/context/+server.ts:37` — consomme `buildContext`

---

## 3. Stratégie de remplacement

Migration **progressive en 4 niveaux**, sans rupture de contrat :

1. **Service `cartography.ts`** — singleton `ContextAgent` par `projectRoot`, 4 fonctions publiques
2. **Migration `context.ts`** — remplace les lectures JSON directes par le service
3. **Endpoint `/api/cartography/refresh`** — mise à jour de l'index après modification
4. **Prompt enrichi** — section `NAVIGATION CARTOGRAPHIE` avec endpoints + interdiction `ls/grep/find`

---

## 4. Étapes de modification du code

### Étape 1 — `src/lib/server/services/cartography.ts` (nouveau)
🔍 **Analyse de Graphe** : nœud nouveau, sera importé par `context.ts`.

Singleton `ContextAgent` en Map cachée au niveau module. Expose :
- `searchMethods(query, projectRoot)` → `MethodSearch.findRelevantMethods()`
- `getSnippet(key, projectRoot)` → `MethodIndexer.extractMethodCode()`
- `getSessionWithCode(query, projectRoot)` → `session.getAtLevel(3)` (snippets inclus)
- `refreshIndex(projectRoot)` → invalide le cache + `MethodIndexer.indexAll()`

### Étape 2 — Refactorer `loadSymbolMap()` dans `context.ts`
🔍 **Analyse de Graphe** : nœud `loadSymbolMap` — même signature retournée, lecture JSON supprimée.

Avant : `JSON.parse(fs.readFileSync(indexPath))` + scoring manuel.
Après : `searchMethods(query, projectRoot)` → mapper en `Record<string, SymbolGroup>`.

### Étape 3 — Refactorer `loadMethodSnippets()` dans `context.ts`
🔍 **Analyse de Graphe** : nœud `loadMethodSnippets` — remplace `extractSnippet()` artisanal.

Avant : lecture de fichier + boucle sur accolades.
Après : `getSessionWithCode(query, projectRoot)` → `MethodIndexer.extractMethodCode()`.

### Étape 4 — Supprimer les fonctions obsolètes
- `extractSnippet()`, `loadAnnotCache()`, `expandWithCallees()` → suppression
- Vérifier avant : aucun import externe dans `src/`

### Étape 5 — `POST /api/cartography/refresh` (nouveau)
🔍 **Analyse de Graphe** : nouveau nœud dans `src/routes/api/cartography/`.

Délègue à `refreshIndex(root)`, retourne `{ updated, skipped, errors }`.

### Étape 6 — Enrichir `formatImplementationPrompt()` dans `prompt.ts`
🔍 **Analyse de Graphe** : nœud `formatImplementationPrompt` — ajout de section sans rupture.

Nouvelle section `NAVIGATION CARTOGRAPHIE` après `CODE PERTINENT` :
```
POST /api/cartography { query }        → trouver des méthodes par sémantique
GET  /api/cartography/snippet?key=...  → obtenir le code précis d'une méthode
POST /api/cartography/refresh          → mettre à jour l'index après modification
INTERDIT: ls -R, grep, find, cat pour naviguer le code
```

---

## 5. Vérifications et nettoyage final

- `buildContext()` retourne un `AgentContext` valide → tester via `/api/context` avec une task existante
- `symbolMap` toujours peuplé (`kwScore > 0`) → comparer résultats avant/après
- Snippet dans `CODE PERTINENT` toujours présent → inspecter les logs de `/api/agent/run`
- Singleton invalidé sur `refreshIndex()` → tester après un changement de fichier dans `lolve`
- Normaliser `path.normalize(projectRoot)` comme clé de cache (compatibilité chemins Windows)
- Point critique : `ContextAgent.init()` est **async** → le service doit cacher la Promise d'init, pas l'instance finale

Le plan est sauvegardé dans `plans/context-aware-provider-ast-driven.md`.