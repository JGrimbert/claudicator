# Plan — Context-Aware Provider (AST-Driven)

## 1. Analyse du problème

🔍 **Analyse de Graphe** : Nœud `buildContext` (context.ts) — point d'entrée du contexte agent.

### Duplication critique

`context.ts` re-implémente manuellement ce que lolve-cartography fait déjà nativement :

| Ce que fait `context.ts` | Ce que fait lolve-cartography |
|---|---|
| Lit `method-index.json` directement (x3) | `MethodIndexer.loadIndex()` |
| Implémente `scoreSymbol()` + `extractKeywords()` | `MethodSearch.findRelevantMethods()` |
| Implémente `extractSnippet()` via `fs.readFileSync` | `MethodIndexer.extractMethodCode()` |
| Implémente `expandWithCallees()` | `SearchSession.expand()` |
| Charge `annotation-cache.json` via `loadAnnotCache()` | `AnnotationCache.load()` dans `ContextAgent` |

### Problème secondaire : agent navigant à l'aveugle

Pendant l'exécution de `/api/agent/run`, l'agent Claude n'a aucun accès structuré à lolve-cartography.
Il est contraint d'utiliser `ls -R`, `grep`, `find` pour explorer le code — ce qui est coûteux en tokens et interdit par la nouvelle règle de navigation.

---

## 2. Localisation des usages

🔍 **Analyse de Graphe** : Nœuds consommateurs de `buildContext`, `loadSymbolMap`, `loadMethodSnippets`.

### `src/lib/server/agent/context.ts`
- `extractSnippet()` (L.20–35) : lecture directe de fichier — dupliqué aussi dans `/api/cartography/snippet/+server.ts`
- `loadAnnotCache()` (L.121–126) : lit `annotation-cache.json` directement — remplacé par `AnnotationCache` dans `ContextAgent`
- `loadSymbolMap()` (L.169–213) : lit `method-index.json`, score manuel → remplacer par `MethodSearch.findRelevantMethods()`
- `expandWithCallees()` (L.220–243) : expansion callees → disponible via `SearchSession.expand()`
- `buildContext()` (L.251–280) : orchestrateur → remplacer par `ContextAgent.createSearchSession()`

### `src/routes/api/agent/run/+server.ts`
- L.36–39 : `loadSymbolMap(root, task.title)` + `loadMethodSnippets(root, symbolMap)` pour le prompt d'implémentation

### `src/routes/api/context/+server.ts`
- L.37 : `buildContext(task, root, description)` — principal consommateur

### `scripts/cartography-search.cjs`
- Instancie `MethodIndexer` + `MethodSearch` + grep manuel en dehors de claudicator
- Logique utilisable via le nouveau service `cartography.ts`

---

## 3. Stratégie de remplacement

Migration **progressive en 4 niveaux** — aucune rupture de contrat existant.

### Niveau 1 — Service `cartography.ts` (couche d'abstraction)
Créer `src/lib/server/services/cartography.ts` :
- Singleton `ContextAgent` par `projectRoot` (Map cachée au niveau module)
- Expose 4 fonctions publiques : `searchMethods`, `getSnippet`, `getSessionWithCode`, `refreshIndex`
- Isole tout couplage à lolve-cartography → facilite tests et changements futurs

### Niveau 2 — Migration de `context.ts`
Remplacer les lectures directes JSON par les appels au service `cartography.ts`.
Conserver les types publics (`SymbolGroup`, `AgentContext`, `MethodSnippet`) — pas de changement de contrat.

### Niveau 3 — Endpoint `POST /api/cartography/refresh`
Déclenche une mise à jour incrémentale de l'index après modification.
Retourne `{ updated, skipped, errors }` depuis `MethodIndexer.indexAll()`.

### Niveau 4 — Prompt enrichi avec section navigation
Ajouter dans `formatImplementationPrompt()` une section `NAVIGATION CARTOGRAPHIE` qui liste les endpoints disponibles et interdit explicitement `ls`, `grep`, `find`.

---

## 4. Étapes de modification du code

---

### Étape 1 — Créer `src/lib/server/services/cartography.ts`

🔍 **Analyse de Graphe** : Nœud nouveau — aucun consommateur existant, sera importé par `context.ts`.

**Contenu** :
```
import { createRequire } from "module";
import path from "path";

// Singleton ContextAgent par projectRoot
const agents = new Map<string, any>();

function getAgent(projectRoot: string): any { ... }

export function searchMethods(query: string, projectRoot: string): any[]
  → agent.findRelevantMethods(query, { maxMethods: 15, minScore: 2, excludeRoles: [] })

export function getSnippet(key: string, projectRoot: string): string | null
  → agent.methodIndexer.extractMethodCode(key)

export function getSessionWithCode(query: string, projectRoot: string): any[]
  → session = agent.createSearchSession(query)
  → session.getAtLevel(3)   // métadonnées + code inclus

export function refreshIndex(projectRoot: string): { updated, skipped, errors }
  → invalide le cache du singleton
  → agent.methodIndexer.indexAll({ force: false })
```

**Point d'attention** : `ContextAgent.init()` est async → pre-initialiser via `await getAgent()` ou utiliser un pattern lazy-init avec `Promise` cachée.

---

### Étape 2 — Refactorer `loadSymbolMap()` dans `context.ts`

🔍 **Analyse de Graphe** : Nœud `loadSymbolMap` → remplace la lecture directe de `method-index.json`.

**Avant** (lecture directe, L.169–213) :
```ts
const raw = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
// ... score manuel avec scoreSymbol() ...
```

**Après** :
```ts
const hits = searchMethods(query, projectRoot);
// Mapper les hits { key, method } en Record<string, SymbolGroup>
```

Conserver le type de retour `Record<string, SymbolGroup>` — aucun changement pour les consommateurs.

---

### Étape 3 — Refactorer `loadMethodSnippets()` dans `context.ts`

🔍 **Analyse de Graphe** : Nœud `loadMethodSnippets` → remplace `extractSnippet()` manuel.

**Avant** (L.41–66) :
```ts
// Lecture method-index.json + extractSnippet() par accès fichier direct
```

**Après** :
```ts
const withCode = getSessionWithCode(query, projectRoot);
// withCode[i].code contient le snippet exact extrait par MethodIndexer.extractMethodCode()
```

---

### Étape 4 — Supprimer les fonctions rendues obsolètes dans `context.ts`

- `extractSnippet()` (L.20–35) → supprimée (remplacée par `MethodIndexer.extractMethodCode()`)
- `loadAnnotCache()` (L.121–126) → supprimée (gérée par `AnnotationCache` dans `ContextAgent`)
- `expandWithCallees()` (L.220–243) → supprimée (remplacée par `session.expand()`)
- Imports `fs`, `createRequire` → à nettoyer si plus utilisés

Vérifier avant suppression : aucun import externe de ces fonctions (`grep` dans `src/`).

---

### Étape 5 — Créer `POST /api/cartography/refresh`

🔍 **Analyse de Graphe** : Nouveau nœud dans `src/routes/api/cartography/` — parallel aux routes existantes.

Fichier : `src/routes/api/cartography/refresh/+server.ts`

```ts
import { json } from "@sveltejs/kit";
import { refreshIndex } from "$lib/server/services/cartography";
import { getProjectRoot } from "$lib/server/services/projects";

export async function POST({ request }) {
    const { projectRoot } = await request.json().catch(() => ({}));
    const root = projectRoot?.trim() || getProjectRoot();
    const stats = await refreshIndex(root);
    return json(stats);
}
```

---

### Étape 6 — Enrichir `formatImplementationPrompt()` dans `prompt.ts`

🔍 **Analyse de Graphe** : Nœud `formatImplementationPrompt` (prompt.ts L.179) — ajout d'une section sans modifier la structure existante.

Ajouter après la section `CODE PERTINENT` :

```
NAVIGATION CARTOGRAPHIE
Explore le code UNIQUEMENT via ces ressources (interdit: ls, grep, find, cat) :
  POST /api/cartography { query: "..." }
    → Trouver les méthodes pertinentes par sémantique (retourne key, file, snippet, score)
  GET /api/cartography/snippet?key=Classe.methode
    → Obtenir le code source précis d'une méthode
  POST /api/cartography/refresh {}
    → Mettre à jour l'index après avoir modifié des fichiers
    → À appeler après chaque modification pour éviter la dérive de contexte

🔍 Processus de navigation :
  1. Identifier le symbole via POST /api/cartography
  2. Obtenir le code via GET /api/cartography/snippet?key=...
  3. Modifier le fichier aux lignes indiquées par startLine/endLine
  4. Appeler POST /api/cartography/refresh
```

---

## 5. Vérifications et nettoyage final

### Tests de non-régression

| Vérification | Méthode |
|---|---|
| `buildContext()` retourne un `AgentContext` valide | Appel manuel via `/api/context` avec une task existante |
| `symbolMap` contient des entrées pertinentes | Vérifier que `kwScore > 0` pour les symboles retournés |
| `formatImplementationPrompt()` inclut `CODE PERTINENT` | Inspecter le prompt dans les logs de `/api/agent/run` |
| `/api/context` retourne la même structure JSON | Comparer avant/après avec une même task |
| `/api/cartography/refresh` retourne `{ updated, skipped, errors }` | Appel POST direct |

### Vérifications de cohérence

1. **Init async** : `ContextAgent.init()` est async — s'assurer que `getAgent()` dans le service retourne une Promise résolue avant toute utilisation.
2. **Singleton multi-projet** : la Map `agents` doit utiliser `path.normalize(projectRoot)` comme clé pour éviter les doublons sur Windows (`C:\lolve` vs `C:/lolve`).
3. **Invalidation du cache** : `refreshIndex()` doit supprimer l'entrée de la Map pour forcer la réinitialisation du `ContextAgent`.
4. **Compatibilité `buildCallGraph`** : `buildContext()` appelle `buildCallGraph` de lolve-cartography — vérifier que `ContextAgent` ne le double pas (il peut).

### Nettoyage final

- Supprimer `extractSnippet()` de `context.ts` (dupliqué dans `/api/cartography/snippet/+server.ts`)
- Supprimer la constante `LC_PATH` + `require` de `call-graph.cjs` de `context.ts` si `ContextAgent` gère déjà le call graph
- Nettoyer les imports inutilisés (`fs`, `createRequire`, `path.join` si plus utilisés)
- Mettre à jour le SYMBOL MAP dans les JSDoc de `context.ts` (nouvelles signatures)

### Points d'attention critiques

- `ContextAgent` dans lolve-cartography prend un objet `config` complet à l'init — il faut générer ce config depuis `getProjectConfig()` de claudicator.
- Alternatif plus simple si `ContextAgent.init()` pose problème : utiliser directement `MethodIndexer` + `MethodSearch` + `AnnotationCache` sans `ContextAgent` (même API, moins de config).
- La section `NAVIGATION CARTOGRAPHIE` dans le prompt ne fonctionne que si l'agent a accès réseau localhost — vérifier que `--add-dir` n'est pas le seul canal.
