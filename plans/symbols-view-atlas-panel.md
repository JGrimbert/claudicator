# Plan — Vue Symboles dans le panneau ATLAS

**Objectif** : Transformer l'onglet SYMBOLES d'AgentConsole en vue de recherche
autonome, alimentée par lolve-carto, acceptant n'importe quel type d'input
(prompt libre, todo, issue, task).

---

## 1. Analyse du problème

L'onglet SYMBOLES dans `AgentConsole.svelte` (lignes 320–326) est actuellement
couplé à une task sélectionnée via le store `$planModeTask`. Il affiche
`ContextViewer` (résumé basique sans score) ou le placeholder "Aucune task
sélectionnée".

Ce qu'il manque :

- Un champ d'input libre pour saisir n'importe quel contexte lexical
- L'affichage du **score de pertinence** pour chaque symbole retourné
- La capacité à déclencher une recherche depuis différents artefacts :
  issue title, todo, prompt libre, description de task
- Un auto-trigger quand la task sélectionnée change

Contrainte clé : la route `/api/cartography` POST accepte déjà `{query: string}`
et retourne des hits sémantiques avec scores. Tout le pipeline lolve-carto est
déjà en place ; il ne manque que la couche UI.

---

## 2. Localisation des usages

| Élément | Fichier | Ligne(s) | Rôle actuel |
|---------|---------|----------|-------------|
| Onglet "symboles" | `src/lib/components/AgentConsole.svelte` | 320–326 | Affiche `ContextViewer` si task présente |
| Import `ContextViewer` | `AgentConsole.svelte` | 5 | Utilisé uniquement dans le bloc symboles |
| `ContextViewer.svelte` | `src/lib/components/ContextViewer.svelte` | entier | Charge `/api/tasks/${id}/methods`, pas de score |
| Route de recherche | `src/routes/api/cartography/+server.ts` | entier | POST `{query}` → `{results, grepResults, grepMethods}` |
| `searchMethods` | `src/lib/server/services/cartography.ts` | 98–110 | Retourne `{key, method, score}[]` avec sélection adaptative |
| `getSessionWithCode` | `src/lib/server/services/cartography.ts` | 117–158 | Retourne `MethodResult[]` avec code source AST |

**Format de réponse `/api/cartography` :**
```
results      → SearchResult[]  (semantic hits : key, file, startLine, score, role, summary, codeSnippet)
grepResults  → GrepResult[]    (grep textuel : file, line, content)
grepMethods  → SearchResult[]  (méthodes trouvées par grep, même format que results)
```

La vue symboles utilise `grepMethods` si non vide, sinon `results`.

---

## 3. Stratégie de remplacement

Créer un composant **`SymbolsView.svelte`** autonome qui :

- Accepte une prop `initialQuery?: string` (pré-remplie depuis task/issue/todo)
- Possède son propre `<input>` pour saisie libre
- Se déclenche sur `Enter` ou clic bouton
- Appelle `/api/cartography` POST (existant, aucune modification backend)
- Affiche les résultats avec : **score**, key, role, file:line, summary, snippet optionnel

Remplacer dans `AgentConsole.svelte` le bloc `activeTab === "symbols"` pour
utiliser `SymbolsView` à la place de `ContextViewer`. Supprimer l'import
`ContextViewer` (utilisé uniquement à cet endroit).

`ContextViewer.svelte` lui-même n'est pas modifié ni supprimé — gardé pour
usage futur potentiel.

---

## 4. Étapes de modification du code

### Étape A — Créer `src/lib/components/SymbolsView.svelte`

**Props :**
```ts
export let initialQuery: string = "";
```

**State local :**
```ts
type SearchResult = {
    key: string; file: string;
    startLine: number | null; endLine: number | null;
    score: number; role: string; summary: string;
    codeSnippet: string | null; snippetError: string | null;
};

let query    = initialQuery;
let results: SearchResult[] = [];
let loading  = false;
let error    = "";
let searched = false;
```

**Réactivité sur la prop `initialQuery`** (auto-trigger quand la task change) :
```ts
$: if (initialQuery !== "" && initialQuery !== query) {
    query = initialQuery;
    search();
}
```

**Fonction `search()` :**
```ts
async function search() {
    if (!query.trim()) return;
    loading = true; error = ""; results = []; searched = true;
    try {
        const res = await fetch("/api/cartography", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
        });
        const data = await res.json();
        if (data.error) { error = data.error; return; }
        // Préférer grepMethods (précis) si présents, sinon semantic results
        results = data.grepMethods?.length ? data.grepMethods : (data.results ?? []);
    } catch (e: any) {
        error = e.message;
    } finally {
        loading = false;
    }
}
```

**Template HTML (structure) :**
```
┌─────────────────────────────────────────────────┐
│  [input: contexte lexical…]             [↵]      │  ← sv-header
├─────────────────────────────────────────────────┤
│  SymbolKey          score 7   role:core          │  ← sv-item
│  file/path.ts:42                                 │
│  Description courte…                             │
│  ─────────────────────────────────────────────── │
│  SymbolKey2         score 4   role:service       │
│  …                                               │
└─────────────────────────────────────────────────┘
```

Chaque `sv-item` affiche :
- `.sv-meta` → clé (violet), score (chiffre), rôle (gris), fichier:ligne (droite)
- `.sv-summary` → description, si présente
- `.sv-snippet` → bloc `<pre>` code, si `codeSnippet` non null

**CSS** : cohérent avec `AgentConsole.svelte` (palette `#05050f`, `#9181f9`,
`JetBrains Mono`, `font-size: 0.63rem`).

---

### Étape B — Modifier `AgentConsole.svelte`

**1. Ajouter l'import :**
```ts
// Remplacer :
import ContextViewer from "$lib/components/ContextViewer.svelte";
// Par :
import SymbolsView from "$lib/components/SymbolsView.svelte";
```

**2. Ajouter la variable réactive `symbolsQuery` :**
```ts
// Après la déclaration de activeTab :
$: symbolsQuery = $planModeTask
    ? [$planModeTask.title, $planModeTask.description].filter(Boolean).join(" ")
    : "";
```

**3. Remplacer le bloc onglet symboles (lignes 320–326) :**
```svelte
{:else if activeTab === "symbols"}
    <div class="dv-panel">
        <SymbolsView initialQuery={symbolsQuery} />
    </div>
```

---

### Étape C — Aucune modification backend requise

La route `/api/cartography/+server.ts` et `cartography.ts` sont utilisées telles
quelles. Le pipeline lolve-carto existant couvre tous les cas d'input.

---

## 5. Vérifications et nettoyage final

1. **Régression `ContextViewer`** : grep confirme que `ContextViewer` n'est
   importé qu'une seule fois dans `AgentConsole.svelte` (ligne 5) et utilisé
   uniquement ligne 323. Suppression de l'import sans effet de bord.

2. **Onglet "query" non impacté** : utilise `queryGrep`/`queryMethods`/
   `querySemantic` via la barre de recherche principale — code séparé.

3. **Compteur onglet "symboles"** : `count: ""` (ligne 159) — pas de changement
   nécessaire. On pourrait afficher `results.length` mais cela demande un store
   partagé ; hors scope.

4. **Auto-trigger au changement de task** : la réactivité Svelte sur
   `initialQuery` dans `SymbolsView` garantit que changer de task dans
   `$planModeTask` relance automatiquement la recherche.

5. **Input libre sans task** : si `$planModeTask` est null, `symbolsQuery = ""`
   et `initialQuery = ""` → le champ input est vide mais fonctionnel pour
   saisie manuelle. Aucun placeholder bloquant.

6. **Test fonctionnel à réaliser** :
   - Sélectionner une task → onglet SYMBOLES → vérifier auto-search avec titre/description
   - Saisir un prompt libre dans le champ → vérifier résultats avec scores
   - Saisir le titre d'une issue → vérifier pertinence des symboles retournés
   - Saisir un todo → idem
   - Vérifier affichage score, key, role, file:line, summary pour chaque résultat
