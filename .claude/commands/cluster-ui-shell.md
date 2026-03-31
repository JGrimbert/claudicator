# Skill : Cluster ui-shell

Protocole de navigation et d'expérience accumulée sur le cluster shell UI principal.

## Périmètre (54+40+27+27+24 touches git)

| Fichier | Responsabilité |
|---|---|
| `src/routes/+page.svelte` | Orchestration principale — onglets, panels, état global UI |
| `src/routes/+layout.svelte` | Layout racine — providers, init |
| `src/lib/components/ArtifactViewer.svelte` | Visualisation d'artefacts (diffs, patches, plans) |
| `src/lib/components/PlanPanel.svelte` | Panel affichage du plan de tâche |
| `src/lib/components/ProjetPanel.svelte` | Panel sélection / info du projet actif |
| `src/lib/components/RoadmapViz.svelte` | Visualisation roadmap (SVG/D3 ou jgr-ui) |
| `src/lib/components/DiagramViewer.svelte` | Visualisation diagramme (Mermaid / cartographie) |
| `src/lib/components/FullPlanView.svelte` | Vue plan complet (fullplan groupe d'issues) |
| `src/lib/components/TodoList.svelte` | Liste TODO (issues sans tâche assignée) |

## Architecture

### Structure en onglets
`+page.svelte` orchestre plusieurs onglets/panels. Les composants sont montés/démontés selon l'onglet actif.
L'état UI global (onglet actif, issue sélectionnée, projet courant) est géré via stores ou props.

### jgr-ui
`node_modules/jgr-ui` est un **symlink** vers `C:/jgr-ui` (`file:../jgr-ui` dans package.json).
Pour mettre à jour : `npm run package` dans `C:/jgr-ui` — immédiatement visible.
**Ne pas utiliser d'alias Vite** → casse le chargement.

### Svelte 5 runes (obligatoire dans tout ce cluster)
```svelte
let x = $state(value)      // état mutable — jamais plain let
let y = $derived(expr)     // valeur calculée — jamais $:
$effect(() => { ... })     // side effect — jamais $:
```
`$:` est interdit et provoque une erreur de compilation.

### ArtifactViewer
Affiche diffs/patches/plans en panel latéral. Reçoit le contenu via prop ou store.

## Protocole d'entrée

1. Lire `src/routes/+page.svelte` pour comprendre l'organisation des panels/onglets
2. Cibler le composant concerné directement (Read avec offset/limit)
3. Si modif jgr-ui → vérifier que le symlink est à jour avant de tester

## Expérience accumulée

### Pitfalls connus
_(vide — se remplit après les issues)_

### Patterns validés
_(vide)_

### Leçons d'issues passées

| Issue | Date | Leçon |
|---|---|---|
