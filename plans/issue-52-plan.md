J'ai maintenant une vue complète. Je génère le plan.
Voici le plan complet :

---

## Plan : Onglet `{ contexte }` — Scroll continu des snippets

### 1. Analyse du problème

`AgentConsole` (zone bas-centre "Carto") ne voit pas les snippets de la task en cours. `MethodsViewer` (colonne droite) affiche un Monaco single avec sélection. La demande est d'ajouter un onglet `{ contexte }` dans le header "Carto" qui scroll tous les snippets en continu, avec séparateurs et coût en tokens.

Le store `planModeTask` contient déjà `{ id, title } | null` = la task sélectionnée.

---

### 2. Localisation des usages

| Fichier | Rôle |
|---|---|
| `AgentConsole.svelte:273` | Header "Carto" — y ajouter le toggle |
| `AgentConsole.svelte:272–327` | Section projet + agent-wrapper — à masquer si actif |
| `MethodsViewer.svelte:46–122` | Pattern Monaco + chargement — à réutiliser |
| `stores/agent.ts:54` | `planModeTask` = task sélectionnée |
| `/api/tasks/[id]/methods` | Retourne `{ methods: MethodSnippet[] }` |

---

### 3. Stratégie

**Nouveau composant** `ContextViewer.svelte` — prop `taskId`, scroll continu N Monaco.  
**Modifier** `AgentConsole.svelte` — onglet toggle + montage conditionnel.  
**MethodsViewer.svelte** — non modifié, reste dans TaskList.

---

### 4. Étapes de code

**Étape 4.1 — `ContextViewer.svelte` (nouveau)**
- `onMount` : fetch méthodes + charger Monaco CDN (guard `window.monaco`)
- Grouper méthodes par fichier → `byFile: [file, MethodSnippet[]][]`
- Header : `N symboles` + `~X tokens (Y cars)` (`totalChars / 4`)
- Template : pour chaque fichier → séparateur fichier `#111`, puis pour chaque symbole → séparateur symbole `#0f0f0f` + signature/role/description + div Monaco
- **Technique multi-Monaco** : action Svelte `use:monacoAction={m}` sur chaque div → `monaco.editor.create()` + hauteur = `lignes × 18px` (min 3, max 80)
- `onDestroy` : `editors.forEach(ed => ed.dispose())`

**Étape 4.2 — `AgentConsole.svelte` (modifier)**
- Importer `planModeTask` + `ContextViewer` + `let showContext = false`
- Header Carto : ajouter bouton `{ contexte }` visible seulement si `$planModeTask`
- Conditionner le contenu : `{#if showContext && $planModeTask} <ContextViewer> {:else} ...existant...`
- Réactivité : `$: if (!$planModeTask) showContext = false`

---

### 5. Vérifications clés

- Onglet `{ contexte }` apparaît seulement si une task est sélectionnée
- N Monaco empilés, taille auto, pas de scroll interne
- Séparateurs visuels fichier (sombre) / symbole (très sombre)
- Coût tokens affiché (`chars / 4`)
- `onDestroy` dispose tous les éditeurs
- MethodsViewer existant non cassé
- Rechargement si `taskId` change (réactivité prop Svelte)

Plan sauvegardé dans `plans/issue-context-tab-plan.md`.