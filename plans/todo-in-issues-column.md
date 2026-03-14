# Plan : TODOs dans la colonne Issues

## 1. Analyse du problème

### Situation actuelle
Les TODOs du code source sont affichés dans `AgentConsole.svelte` (colonne centrale),
dans un onglet dédié "todo" d'une interface à onglets. Leur rendu est custom (`grep-item`),
distinct de `ItemRow`.

Les Issues GitHub sont affichées dans `IssueList.svelte` (colonne gauche, `aside`),
avec `ItemRow` comme composant de rendu.

### Objectif
Intégrer les TODOs dans la colonne gauche (`aside`), dans la même liste que les Issues,
en harmonisant le rendu avec `ItemRow`.

### Contrainte principale
Les items TODO ont un bouton d'action secondaire "→ Task" (créer une task depuis ce TODO).
`ItemRow` n'en a pas. Il faudra étendre `ItemRow` minimalement.

---

## 2. Localisation des usages

### `AgentConsole.svelte` — code à migrer

| Élément | Ligne | Destination |
|---|---|---|
| `type GrepResult` | 97 | À déplacer dans `$lib/stores/agent.ts` ou dans `TodoList.svelte` |
| `todoGrep`, `todoMethods`, `todoLoading` | 100–102 | Migrer dans `TodoList.svelte` |
| `loadTodos()` | 180–189 | Migrer dans `TodoList.svelte` |
| `creatingTodo`, `createdTodo` | 218–219 | Migrer dans `TodoList.svelte` |
| `createTaskFromTodo()` | 221–260 | Migrer dans `TodoList.svelte` |
| Onglet "todo" dans `tabs` | 163 | Supprimer |
| Rendu onglet "todo" dans le template | 321–347 | Supprimer |

### `IssueList.svelte` — modèle à suivre
Structure à reproduire dans `TodoList.svelte` :
- Header avec titre + compteur + bouton refresh
- `<div class="list">` avec les items via `ItemRow`
- Panel `.panel` avec `panel-header` et `.list`
- CSS identique (`panel`, `panel-header`, `list`, `hint`, `error`)

### `ItemRow.svelte` — extension nécessaire
Ajouter une prop optionnelle `action` pour le bouton "→ Task" :
```ts
export let action: { label: string; onclick: (e: MouseEvent) => void } | null = null;
```
Ce bouton s'affiche à droite dans `.item-top`, stoppant la propagation du click parent.

### `+page.svelte`
- Ajouter `<TodoList />` dans `<aside>`, entre `<IssueList />` et la fin
- Ajouter un `vhandle` entre `IssueList` et `TodoList`
- Gérer un troisième pourcentage de split vertical (`asideBottomPct`) ou laisser flex naturel

---

## 3. Stratégie de remplacement

**Approche choisie : nouveau composant `TodoList.svelte`**

Copier la structure de `IssueList.svelte` et l'adapter pour les TODOs.
Avantages :
- Séparation claire des responsabilités
- Pas de modification de `IssueList` (pas de régression sur les Issues)
- Facilement extensible (futur: refresh, filtres)

**Alternative écartée** : modifier `IssueList` pour y injecter les TODOs → risque de régression,
couplage fort entre deux sources de données (GitHub API vs cartographie locale).

**Extension de `ItemRow`** : ajout d'une prop `action` optionnelle (aucune régression si `null` par défaut).

---

## 4. Étapes de modification du code

### Étape 1 — Étendre `ItemRow.svelte`

Fichier : `src/lib/components/ItemRow.svelte`

Ajouter la prop :
```ts
export let action: { label: string; loading?: boolean; done?: boolean; onclick: (e: MouseEvent) => void } | null = null;
```

Dans le template, dans `.item-top`, ajouter à droite (avant la fermeture) :
```svelte
{#if action}
    <button
        class="item-action"
        class:done={action.done}
        onclick={(e) => { e.stopPropagation(); action.onclick(e); }}
        disabled={action.loading || action.done}
    >{action.done ? "✓" : action.loading ? "…" : action.label}</button>
{/if}
```

CSS à ajouter :
```css
.item-top { justify-content: space-between; }
.item-action {
    background: none;
    border: 1px solid #2a2a2a;
    color: #444;
    font-size: 0.58rem;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
    transition: color 0.1s, border-color 0.1s;
}
.item-action:hover:not(:disabled) { color: #9181f9; border-color: #9181f9; }
.item-action.done { color: #4caf50; border-color: #4caf50; }
.item-action:disabled { opacity: 0.5; cursor: default; }
```

### Étape 2 — Créer `TodoList.svelte`

Fichier : `src/lib/components/TodoList.svelte`

Structure calquée sur `IssueList.svelte` :

```svelte
<script lang="ts">
    import { onMount } from "svelte";
    import { notifyTaskCreated } from "$lib/stores/agent";
    import ItemRow from "$lib/components/ItemRow.svelte";

    type GrepResult = { file: string; line: number; content: string };

    let todos: GrepResult[] = [];
    let loading = true;
    let error = "";
    let creatingTodo: Record<string, boolean> = {};
    let createdTodo:  Record<string, boolean> = {};

    async function loadTodos() { /* fetch /api/cartography POST { query: "TODO" } */ }
    async function createTaskFromTodo(g: GrepResult) { /* logique existante */ }

    function cleanTitle(content: string): string { /* strip // TODO: */ }
    function shortFile(file: string): string { /* basename */ }

    onMount(loadTodos);
</script>

<div class="panel">
    <div class="panel-header">
        <span>TODOs {#if loading}<span class="refreshing">↻</span>{/if}</span>
        <button class="new-btn" onclick={loadTodos} title="Rafraîchir">↻</button>
    </div>
    <div class="list">
        {#if error}
            <p class="hint error">{error}</p>
        {:else if todos.length === 0 && !loading}
            <p class="hint">Aucun TODO</p>
        {:else}
            {#each todos as g}
                {@const key = `${g.file}:${g.line}`}
                <ItemRow
                    prefix="{shortFile(g.file)}:{g.line}"
                    title={cleanTitle(g.content)}
                    labels={[]}
                    state="todo"
                    action={{
                        label: "→ Task",
                        loading: creatingTodo[key],
                        done: createdTodo[key],
                        onclick: () => createTaskFromTodo(g)
                    }}
                />
            {/each}
        {/if}
    </div>
</div>
```

CSS : copier exactement `.panel`, `.panel-header`, `.list`, `.hint`, `.new-btn` depuis `IssueList.svelte`.

### Étape 3 — Intégrer `TodoList` dans `+page.svelte`

Fichier : `src/routes/+page.svelte`

1. Importer le composant :
```ts
import TodoList from "$lib/components/TodoList.svelte";
```

2. Dans `<aside>`, après `<IssueList />`, ajouter un séparateur et `TodoList` :
```svelte
<aside ...>
    <div class="aside-top" style="height: {asideTopPct}%">
        <ArtifactViewer />
    </div>
    <div class="vhandle" ... onmousedown={startDragV}></div>
    <IssueList />
    <div class="vhandle" ... onmousedown={startDragV2}></div>
    <TodoList />
</aside>
```

Note : le split entre IssueList et TodoList peut être géré par un 2e split vertical
(`asideBottomPct`) ou simplement par `flex: 1` sur les deux (50/50 par défaut),
avec un `vhandle` redimensionnable stocké dans `localStorage` (clé `claudicator:aside-bottom-split`).

Si la complexité du 3e split est jugée excessive, on peut utiliser `flex: 1` sans handle
dans un premier temps.

### Étape 4 — Nettoyer `AgentConsole.svelte`

1. Supprimer les variables : `todoGrep`, `todoMethods`, `todoLoading`, `creatingTodo`, `createdTodo`
2. Supprimer les fonctions : `loadTodos()`, `createTaskFromTodo()`
3. Dans `tabs` : supprimer la ligne qui pousse l'onglet "todo"
4. Dans le template : supprimer la condition `activeTab === "todo"` et son bloc
5. Supprimer l'appel `loadTodos()` dans `onMount`
6. Supprimer le type `GrepResult` si non utilisé ailleurs (il reste pour le mode "query")
   → **Garder `GrepResult`** car toujours utilisé pour `queryGrep`

---

## 5. Vérifications et nettoyage final

### Régressions à vérifier

- [ ] `IssueList` : les issues s'affichent normalement (prop `action` non passée → null → absent)
- [ ] `ItemRow` : l'ancienne interface sans `action` ne régresse pas (prop optionnelle)
- [ ] `AgentConsole` : l'onglet "query" fonctionne toujours (utilise encore `GrepResult`)
- [ ] `TodoList` : `createTaskFromTodo` crée bien une task et notifie `TaskList`
- [ ] Le bouton "→ Task" stoppe la propagation (ne sélectionne pas la task en même temps)
- [ ] Le resize du panneau `aside` fonctionne toujours avec la nouvelle hauteur

### Points d'attention

- L'appel `/api/cartography POST { query: "TODO" }` utilisé dans `AgentConsole` doit être
  reproduit à l'identique dans `TodoList` — vérifier que l'endpoint est accessible côté serveur
- `notifyTaskCreated()` doit être appelé après création de task pour rafraîchir `TaskList`
- Le `shortFile()` (afficher juste le basename) améliorera la lisibilité dans la colonne étroite
- Si le panneau est collapsed (collapsed.aside), `TodoList` est masqué avec le reste → OK

### Ordre de priorité
1. `ItemRow` (extension minimale)
2. `TodoList` (nouveau composant)
3. Intégration dans `+page.svelte`
4. Nettoyage `AgentConsole`
