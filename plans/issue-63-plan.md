Voici le plan complet :

---

# Plan : Fusion ISSUES + TODO en liste à onglets

## 1. Analyse du problème

Actuellement, la colonne gauche (`<aside>`) empile verticalement :
1. `ArtifactViewer` (haut, redimensionnable)
2. `.vhandle` (séparateur vertical drag)
3. `<IssueList />` (liste issues)
4. `.aside-sep` (séparateur fixe)
5. `<TodoList />` (liste todos)

L'objectif est de remplacer les items 3, 4 et 5 par **un seul panneau à onglets** qui affiche soit ISSUES soit TODOS selon l'onglet actif — en reprenant exactement le pattern de `AgentConsole` (tabs simples).

---

## 2. Localisation des usages

| Fichier | Ligne | Usage |
|---|---|---|
| `src/routes/+page.svelte` | L.4 | `import IssueList` |
| `src/routes/+page.svelte` | L.11 | `import TodoList` |
| `src/routes/+page.svelte` | L.532-534 | `<IssueList />`, `.aside-sep`, `<TodoList />` dans `<aside>` |

`IssueList.svelte` et `TodoList.svelte` ne sont utilisés nulle part ailleurs.

---

## 3. Stratégie de remplacement

Créer un **nouveau composant `IssuesTodoPanel.svelte`** qui :
- Contient les deux onglets : `issues` et `todos`
- Intègre `IssueList` et `TodoList` comme contenu de chaque onglet
- Utilise exactement le pattern de tabs de `AgentConsole` (variable `activeTab`, classe `tab-active`, badge `tab-count`)

Pas de suppression des composants existants — ils restent intacts et sont simplement wrappés.

---

## 4. Étapes de modification du code

### Étape 1 — Créer `src/lib/components/IssuesTodoPanel.svelte`

Structure du composant :

```svelte
<script lang="ts">
  import IssueList from "./IssueList.svelte";
  import TodoList from "./TodoList.svelte";

  let activeTab: "issues" | "todos" = "issues";
  // Récupérer les counts depuis les composants enfants via bind: ou props remontées
</script>

<div class="issues-todo-panel">
  <div class="panel-tabs">
    <button class="tab" class:tab-active={activeTab === "issues"} onclick={() => activeTab = "issues"}>
      issues
    </button>
    <button class="tab" class:tab-active={activeTab === "todos"} onclick={() => activeTab = "todos"}>
      todos
    </button>
  </div>

  {#if activeTab === "issues"}
    <IssueList hideHeader={true} />
  {:else}
    <TodoList hideHeader={true} />
  {/if}
</div>
```

**Note sur les headers** : `IssueList` et `TodoList` ont chacun leur propre `panel-header` avec leur titre. Deux options :
- **Option A (simple)** : cacher le header interne via une prop `hideHeader` — ajouter `export let hideHeader = false` dans chaque composant et wrap le `panel-header` dans `{#if !hideHeader}`
- **Option B (minimal)** : conserver les headers internes et juste superposer les onglets au-dessus — plus simple à implémenter mais visuellement redondant

→ **Recommandation : Option A**, propre visuellement

### Étape 2 — Modifier `IssueList.svelte`

Ajouter en haut du `<script>` :
```typescript
export let hideHeader = false;
```

Wrapper le bloc `panel-header` :
```svelte
{#if !hideHeader}
  <div class="panel-header">
    <!-- contenu existant -->
  </div>
{/if}
```

### Étape 3 — Modifier `TodoList.svelte`

Même modification que `IssueList.svelte` :
```typescript
export let hideHeader = false;
```
Et wrapper le `panel-header` avec `{#if !hideHeader}`.

### Étape 4 — Modifier `+page.svelte`

Remplacer dans `<aside>` :
```svelte
<!-- AVANT -->
<IssueList />
<div class="aside-sep" role="separator"></div>
<TodoList />

<!-- APRÈS -->
<IssuesTodoPanel />
```

Et mettre à jour les imports :
```typescript
// Supprimer
import IssueList from "$lib/components/IssueList.svelte";
import TodoList from "$lib/components/TodoList.svelte";

// Ajouter
import IssuesTodoPanel from "$lib/components/IssuesTodoPanel.svelte";
```

Supprimer aussi le CSS de `.aside-sep` s'il n'est plus utilisé.

### Étape 5 — CSS dans `IssuesTodoPanel.svelte`

Copier les styles de tabs de `AgentConsole` :
```css
.issues-todo-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.panel-tabs {
  display: flex;
  align-items: center;
  height: 28px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.tab {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #2e2e2e;
  padding: 0 0.55rem;
  height: 100%;
  border-right: 1px solid var(--border);
  transition: color 0.1s;
}
.tab:hover { color: #555; }
.tab-active { color: #777; }
```

---

## 5. Vérifications et nettoyage final

| Vérification | Comment |
|---|---|
| `IssueList` fonctionnel avec `hideHeader=true` | Tester que la liste se charge et scroll correctement |
| `TodoList` fonctionnel avec `hideHeader=true` | Tester le chargement des TODOs |
| Onglet actif persisté | Optionnel : sauvegarder dans `localStorage` (clé `claudicator:left-tab`) |
| `.aside-sep` CSS supprimé | Vérifier qu'il n'y a plus de référence dans `+page.svelte` |
| Hauteur du panneau | Le nouveau panneau doit prendre `flex: 1` pour occuper l'espace libéré par la suppression du séparateur |
| Import `IssueList` et `TodoList` dans `+page.svelte` | Supprimer les imports devenus inutiles |

---

**Fichiers modifiés :**
1. `src/lib/components/IssuesTodoPanel.svelte` — créer (nouveau)
2. `src/lib/components/IssueList.svelte` — ajouter prop `hideHeader`
3. `src/lib/components/TodoList.svelte` — ajouter prop `hideHeader`
4. `src/routes/+page.svelte` — remplacer les 3 balises par `<IssuesTodoPanel />`