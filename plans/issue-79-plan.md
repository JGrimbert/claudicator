Maintenant j'ai toute l'information nécessaire pour produire le plan. Voici le plan détaillé :

---

# Plan — Filtre probabiliste dans la colonne artefacts

## 1. Analyse du problème

La colonne de gauche expose trois listes :
- **Issues** (`IssueList.svelte`) — issues GitHub, pas d'input de filtre
- **Todos** (`TodoList.svelte`) — résultats grep, pas d'input de filtre
- **Tasks** (`TaskList.svelte`) — tâches locales, input `placeholder="Nouvelle task…"` (ligne 512)

L'objectif est de remplacer/unifier ces zones par un **input de filtre probabiliste** dans chaque liste, en utilisant une bibliothèque fuzzy search côté client. Aucun appel serveur n'est nécessaire pour le filtrage.

**Bibliothèque recommandée : `fuse.js`**
- Pure JS, zero dépendance
- Fuzzy search sur objets structurés
- Score configurable (threshold, keys, includeScore)
- Très légère (~24 KB)

---

## 2. Localisation des usages

| Fichier | Localisation exacte | Changement nécessaire |
|---|---|---|
| `src/lib/components/TaskList.svelte` | L.509–517 : `<div class="new-task"><input placeholder="Nouvelle task…">` | Remplacer l'input "nouvelle task" par un input filtre |
| `src/lib/components/IssueList.svelte` | L.247 : `<div class="list">` — aucun input texte | Ajouter un input filtre avant `<div class="list">` |
| `src/lib/components/TodoList.svelte` | Structure analogue — aucun input texte | Ajouter un input filtre avant la liste |
| `package.json` | `dependencies` | Ajouter `fuse.js` |

**Périmètre non touché :**
- `IssuesTodoPanel.svelte` : le bouton "+" reste dans la barre des onglets (pas de filtre global à ce niveau)
- API routes : aucun changement (filtre 100% client)
- `ItemRow.svelte` : aucun changement

---

## 3. Stratégie

### Approche : filtre local dans chaque composant

Chaque liste gère son propre état de filtre (`filterQuery: string = ""`). Fuse.js est instancié en réactif quand les données changent. La liste affichée est dérivée (`$derived` / `$:`) du score fuzzy.

```
données brutes  →  Fuse(données, options)  →  fuse.search(query)  →  liste filtrée  →  rendu
```

Si `filterQuery` est vide → afficher toutes les données (pas d'instanciation Fuse inutile).

### Config Fuse.js par liste

**IssueList** — chercher sur `title` et `number` :
```js
new Fuse(issues, { keys: ['title'], threshold: 0.4, includeScore: true })
```

**TodoList** — chercher sur le texte du TODO et le chemin fichier :
```js
new Fuse(todos, { keys: ['text', 'file'], threshold: 0.4 })
```

**TaskList** — chercher sur `title` :
```js
new Fuse(tasks, { keys: ['title'], threshold: 0.4 })
```

### Cas de la création de task

L'input "Nouvelle task" servait aussi à créer une tâche (via `onkeydown`). Il faut **conserver cette fonctionnalité** autrement. Options :
- Option A : Garder le bouton "+" dans la barre de status filters de TaskList, qui ouvre un modal/input inline
- Option B : La création de task reste accessible via `ArtifactViewer` ("Task →" depuis une issue) — c'est déjà le flux principal

→ **Option B recommandée** : le flux de création via issue est le chemin standard. Le champ "Nouvelle task" autonome peut être retiré. Si nécessaire, ajouter un petit bouton `+` dans le header de TaskList.

---

## 4. Étapes de modification du code

### Étape 1 — Installer fuse.js

```bash
npm install fuse.js
```

Aucune config Vite nécessaire (fuse.js est tree-shakable et ESM-compatible).

### Étape 2 — TaskList.svelte : remplacer "Nouvelle task" par filtre

**Supprimer** :
- State `newTitle`, `creating`, fonction `createTask`, `onKey`
- Le bloc `<div class="new-task">...</div>` (L.509–517)
- Le style `.new-task`, `.new-input`

**Ajouter** :
```svelte
<script>
  import Fuse from 'fuse.js';

  let filterQuery = '';

  $: fuse = new Fuse(tasks, { keys: ['title'], threshold: 0.4 });
  $: filtered = filterQuery.trim()
    ? fuse.search(filterQuery).map(r => r.item)
    : tasks; // déjà filtré par status filter existant
</script>

<!-- Remplace <div class="new-task"> -->
<div class="filter-bar">
  <input
    class="filter-input"
    placeholder="Filtrer…"
    bind:value={filterQuery}
  />
  {#if filterQuery}
    <button class="filter-clear" onclick={() => filterQuery = ''}>✕</button>
  {/if}
</div>
```

> **Note** : TaskList a déjà un filtre par statut (`filter` variable, L.500–506). Le filtre texte s'applique **en plus** : d'abord filtrer par status, puis par fuzzy search sur le résultat.

### Étape 3 — IssueList.svelte : ajouter filtre

Après `{#if $agentState.issue?.subIssues?.length}...{/if}` (L.240–245), **avant** `<div class="list">` (L.247) :

```svelte
<script>
  import Fuse from 'fuse.js';
  let filterQuery = '';

  $: fuse = new Fuse(filteredIssues, { keys: ['title'], threshold: 0.4 });
  $: displayedIssues = filterQuery.trim()
    ? fuse.search(filterQuery).map(r => r.item)
    : filteredIssues;
</script>

<div class="filter-bar">
  <input class="filter-input" placeholder="Filtrer…" bind:value={filterQuery} />
  {#if filterQuery}
    <button class="filter-clear" onclick={() => filterQuery = ''}>✕</button>
  {/if}
</div>
```

Remplacer `{#each filteredIssues as issue}` par `{#each displayedIssues as issue}`.

### Étape 4 — TodoList.svelte : ajouter filtre

Même pattern. Chercher sur le champ texte du TODO (à identifier dans la structure `GrepResult`).

```svelte
<script>
  import Fuse from 'fuse.js';
  let filterQuery = '';

  $: fuse = new Fuse(todos, { keys: ['text', 'file'], threshold: 0.45 });
  $: displayedTodos = filterQuery.trim()
    ? fuse.search(filterQuery).map(r => r.item)
    : todos;
</script>
```

Remplacer l'itération sur `todos` par `displayedTodos`.

### Étape 5 — Styles partagés

Créer un style cohérent `.filter-bar` / `.filter-input` / `.filter-clear` dans chacun des composants (ou dans `app.css` si une feuille globale existe) :

```css
.filter-bar {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.filter-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 0.65rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-muted);
  padding: 0.3rem 0.6rem;
}
.filter-input::placeholder { color: var(--border-strong); }
.filter-clear {
  background: none;
  border: none;
  color: #444;
  cursor: pointer;
  padding: 0 0.4rem;
  font-size: 0.7rem;
}
```

---

## 5. Vérifications et nettoyage final

### Régressions à vérifier

| Scénario | Vérification |
|---|---|
| TaskList : filtre statut existant (specification, failed…) | Le filtre texte s'applique après le filtre statut — ne pas casser la variable `filtered` existante |
| TaskList : sélection d'une task | `selectTask(task)` continue à fonctionner sur les items fuzzy-filtrés |
| IssueList : `filteredIssues` (exclut sub-issues et issues fermées) | La base de données Fuse doit être `filteredIssues` (déjà filtrée), pas `issues` brutes |
| TodoList : reload des TODOs | Quand `todos` change (rechargement), Fuse doit se réinstancier — la réactivité `$:` le garantit |
| Query vide | Afficher toutes les items, ne pas appeler `fuse.search("")` qui renvoie `[]` |
| Réinitialisation au changement d'onglet | `filterQuery` peut rester en mémoire — acceptable, pas de régression |

### Suppression à faire

- Retirer le state `newTitle`, `creating`, la fonction `createTask()`, `onKey()` de TaskList si décision Option B confirmée
- Retirer les styles `.new-task`, `.new-input` de TaskList

### Vérification des types

- `GrepResult` dans TodoList : vérifier les champs disponibles pour configurer les `keys` Fuse correctement
- `Issue` et `Task` : types déjà connus, pas de changement

---

**Résumé des fichiers touchés :**
- `package.json` (+1 dep)
- `src/lib/components/TaskList.svelte` (remplace input création, ajoute filtre)
- `src/lib/components/IssueList.svelte` (ajoute filtre)
- `src/lib/components/TodoList.svelte` (ajoute filtre)