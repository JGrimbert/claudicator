# Skill : Cluster issues-panel

Protocole de navigation et d'expérience accumulée sur le cluster gestion des issues.

## Périmètre (37+26+19+10+~50 touches git)

| Fichier | Responsabilité |
|---|---|
| `src/lib/components/IssueList.svelte` | Liste des issues GitHub — filtre, sélection, affichage |
| `src/lib/components/IssueAnalysis.svelte` | Analyse détaillée d'une issue (plan, context, usecase) |
| `src/lib/components/IssueGroups.svelte` | Groupes d'issues — stacks, DAG, fullplans |
| `src/lib/components/IssuesTodoPanel.svelte` | Panel TODO issues (issues sans tâche) |
| `src/lib/components/ItemRow.svelte` | Ligne d'issue réutilisable dans les listes |
| `src/lib/server/services/github.ts` | API GitHub — getIssue, getIssues, createIssue, createIssueComment, getSubIssues |
| `src/lib/server/agent/issue-grouping.ts` | Logique de regroupement / clustering d'issues |
| `src/lib/server/agent/issue-analysis.ts` | Analyse automatique d'une issue (usecase, symboles) |
| `src/lib/server/agent/issue.ts` | Agent issue — orchestration analyse |
| `src/routes/api/issues/+server.ts` | Liste / création issues |
| `src/routes/api/issues/[number]` | Détail d'une issue |
| `src/routes/api/issues/groups` | Groupes d'issues (stacks, fullplans) |
| `src/routes/api/issues/analyze` | Déclenchement analyse / mise à jour analyse |
| `src/routes/api/issues/snapshot` | Snapshot des issues GitHub |
| `src/routes/api/issues/roadmap(s)` | Roadmap issues |

## Architecture

### Source de données
Les issues sont lues depuis GitHub via `@octokit/rest` (token `GITHUB_TOKEN`).
Un snapshot est sauvegardé localement dans `.agent/issues/`.
L'état courant provient du snapshot, refreshé à la demande.

### Groupes et stacks
Un groupe d'issues peut avoir un type :
- **stack** — issues à implémenter en séquence
- **fullplan** — plan complet généré pour tout le groupe

### Analyse d'issue
L'analyse extrait :
- le usecase (comportement attendu)
- les symboles pertinents (via context.ts / SYMBOL MAP)
- les liens avec d'autres issues

### Multi-projets
`github.ts` opère sur le projet sélectionné dans `.agent/projects.json`.
Le repo cible est distinct de claudicator lui-même.

## Protocole d'entrée

1. Si modif UI issue → lire le composant concerné ciblé
2. Si modif logique groupement → lire `issue-grouping.ts` + `IssueGroups.svelte`
3. Si modif API issues → lire la route ciblée + `github.ts` si nécessaire

## Expérience accumulée

### Pitfalls connus
_(vide — se remplit après les issues)_

### Patterns validés
_(vide)_

### Leçons d'issues passées

| Issue | Date | Leçon |
|---|---|---|
