J'ai maintenant une bonne vue du code. Voici le plan détaillé.

---

# Plan — Afficher les méthodes concernées avec Monaco Editor

## 1. Analyse du problème

La function `buildContext` (context.ts:182) construit déjà un `symbolMap` qui liste les méthodes pertinentes pour une task à partir de `method-index.json`. Ce map contient `{ file, sigs[] }` par classe.

Cependant :
- Il ne retourne **que les signatures**, pas les snippets de code source
- Il n'y a **aucun composant** pour afficher ce code
- Monaco Editor n'est **pas encore intégré** au projet

Le besoin : à partir de l'id d'une task, afficher les méthodes du symbolMap avec leur code source dans Monaco Editor.

---

## 2. Localisation des usages

| Fichier | Rôle actuel | Impact |
|---|---|---|
| `src/lib/server/agent/context.ts` | `buildContext` + `loadSymbolMap` (privé) | Exporter `loadSymbolMap` |
| `src/routes/api/context/+server.ts` | POST → retourne symbolMap sans snippets | Inchangé |
| `src/routes/api/cartography/methods/+server.ts` | GET → list avec `startLine` seulement | Référence pour la structure |
| `src/lib/components/TaskList.svelte` | Workflow panels Plan/Implement/Commit/Push | Ajouter panel "Symboles" |
| `src/lib/components/IssueAnalysis.svelte` | Chargement dynamique Mermaid depuis CDN | Pattern à reproduire pour Monaco |

Nouveaux fichiers à créer :
- `src/routes/api/tasks/[id]/methods/+server.ts`
- `src/lib/components/MethodsViewer.svelte`

---

## 3. Stratégie

### Extraction des snippets

`method-index.json` contient `startLine` par méthode (confirmé dans `/api/cartography/methods`). La présence de `endLine` est à vérifier. Stratégie de fallback en 3 niveaux :
1. Utiliser `endLine` si présent dans l'index
2. Sinon, compter les accolades `{` / `}` depuis `startLine` pour trouver la fin
3. Fallback : lire 40 lignes depuis `startLine`

### Chargement Monaco Editor

Charger depuis CDN comme Mermaid dans `IssueAnalysis.svelte` — pas de bundling, injection dynamique `<script>` via `onMount`. Pattern : `window.monaco` comme singleton.

### Architecture du composant

Un seul éditeur Monaco global par composant (pas un par méthode — trop lourd). Navigation par liste : clic sur une méthode → l'éditeur central affiche son code.

---

## 4. Étapes de modification du code

### Étape 1 — Exporter `loadSymbolMap` depuis `context.ts`

Dans `src/lib/server/agent/context.ts` :
- Changer `function loadSymbolMap(...)` en `export function loadSymbolMap(...)`
- Exposer aussi le type `MethodEntry` en export si nécessaire

### Étape 2 — Créer `GET /api/tasks/[id]/methods`

Créer `src/routes/api/tasks/[id]/methods/+server.ts` :

```ts
GET({ params }) {
  1. getTask(params.id) → 404 si absent
  2. const root = getProjectRoot()
  3. const indexPath = join(root, ".cache/method-index.json")
  4. Lire method-index.json → allMethods
  5. const symbolMap = loadSymbolMap(root, task.title)
  6. Pour chaque entry dans symbolMap:
     - Pour chaque sig dans entry.sigs:
       - Trouver la clé correspondante dans allMethods
       - Récupérer file, startLine, endLine
       - Lire le fichier source → extraire les lignes startLine..endLine
       - Construire { key, file, startLine, endLine, snippet, signature, role, description }
  7. return json({ methods })
}
```

Format de retour :
```ts
interface MethodSnippet {
  key: string          // "ClassName.methodName"
  file: string         // "src/prima/foo.js"
  startLine: number
  endLine: number
  snippet: string      // code source brut
  signature: string
  role: string | null
  description: string | null
}
```

### Étape 3 — Créer `MethodsViewer.svelte`

`src/lib/components/MethodsViewer.svelte` :

**Props :** `taskId: string`

**Structure UI :**
```
┌─────────────────────────────────────────────────────┐
│ SYMBOLES CONCERNÉS                    [3 méthodes]  │
├──────────────────┬──────────────────────────────────┤
│ Liste méthodes   │  Monaco Editor (lecture seule)   │
│                  │                                  │
│ ● ClassName      │  // src/prima/foo.js:42          │
│   .methodName()  │  methodName(arg1, arg2) {        │
│   .otherMethod() │    // ...                        │
│                  │  }                               │
│ ● OtherClass     │                                  │
│   .doSomething() │                                  │
└──────────────────┴──────────────────────────────────┘
```

**Comportement :**
- `onMount` : charger Monaco depuis CDN (`https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs/loader.js`), puis `fetch /api/tasks/[taskId]/methods`
- Clic sur méthode → `editor.setValue(snippet)` + `editor.revealLine(1)`
- Monaco en mode `readOnly: true`, language `javascript` ou `typescript` selon extension
- `onDestroy` : `editor.dispose()`
- Thème : `vs-dark` ou thème custom cohérent avec `#05050f`

**Chargement Monaco (pattern CDN RequireJS) :**
```js
window.require.config({ paths: { vs: "https://cdn.jsdelivr.net/.../min/vs" } });
window.require(["vs/editor/editor.main"], () => {
  editor = monaco.editor.create(container, { ... });
});
```

### Étape 4 — Intégrer dans `TaskList.svelte`

Dans `src/lib/components/TaskList.svelte` :

1. Importer `MethodsViewer`
2. Ajouter `"methods"` au type `WfPanel`
3. Dans la barre de navigation du workflow, ajouter un bouton "Symboles" visible quand une task est sélectionnée
4. Dans la zone d'affichage :
   ```svelte
   {:else if selectedPanel === "methods"}
     <MethodsViewer taskId={selected.id} />
   ```

Le bouton n'est visible que si la task a un `symbolMap` non vide (vérifiable via la réponse de l'endpoint).

---

## 5. Vérifications et nettoyage final

**Régressions à éviter :**
- `loadSymbolMap` exporté → vérifier que les autres usages internes (dans `buildContext`) fonctionnent toujours
- Monaco CDN : ne pas bloquer le rendu si le CDN est inaccessible — afficher un fallback `<pre>` avec le snippet brut
- `editor.dispose()` dans `onDestroy` pour éviter les fuites mémoire

**Cas limites :**
- Task sans `issueNumber` → `loadSymbolMap` fonctionne sur le titre seul (déjà géré)
- `method-index.json` absent dans le projet cible → 404 gracieux, message "Cartographie non disponible"
- Méthode dans un fichier supprimé → skip silencieux
- Snippet très long (>200 lignes) → Monaco gère nativement, limiter à 100 lignes si nécessaire

**Vérifications de build :**
- Monaco ne doit **pas** être importé via `import` (bundler) — uniquement via CDN
- Le nouveau `+server.ts` doit rester dans `src/routes/api/` (server-only, accès `fs`)
- Aucun `import monaco` côté serveur