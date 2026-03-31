# Skill : Cluster task-workflow

Protocole de navigation et d'expérience accumulée sur le cluster tâches/cycle-de-vie.

## Périmètre (97+23+~60 touches git)

| Fichier | Responsabilité |
|---|---|
| `src/lib/components/TaskList.svelte` | UI principale — liste des tâches, boutons d'action par état |
| `src/lib/server/services/tasks.ts` | CRUD + états, persistance JSON dans `.agent/tasks/` |
| `src/routes/api/tasks/+server.ts` | Liste / création de tâches |
| `src/routes/api/tasks/[id]/+server.ts` | Lecture / mise à jour d'une tâche |
| `src/routes/api/tasks/[id]/initial-commit` | Crée la branche + commite le plan |
| `src/routes/api/tasks/[id]/commit` | Commite le patch sur la branche |
| `src/routes/api/tasks/[id]/push` | Push la branche vers origin |
| `src/routes/api/tasks/[id]/merge` | Merge + ferme l'issue GitHub |
| `src/routes/api/tasks/[id]/sync` | Synchronise l'état depuis le repo |
| `src/routes/api/tasks/[id]/diff` | Génère le diff courant |
| `src/routes/api/tasks/[id]/plan` | Lecture/écriture du fichier .plan.md |
| `src/routes/api/tasks/[id]/methods` | Méthodes liées à la tâche (context) |
| `src/routes/api/tasks/[id]/patches` | Liste les .patch générés |
| `src/routes/api/tasks/[id]/revert` | Annule le dernier commit |

## Architecture

### Cycle de vie (`TaskStatus`)
```
specification → planification → implementation → documentation → validation → merged
                                                                            ↘ failed
```

### `TaskType`
- `"standard"` — issue unique, plan puis implémentation
- `"fullplan"` — plan complet d'un groupe d'issues

### Persistance
- État : `.agent/tasks/<id>.json` (projet défaut) ou `.agent/tasks/<projectId>/<id>.json`
- Plan : `.agent/tasks/<id>.plan.md`
- Patches : `.agent/tasks/<id>/patches/*.patch`

### Champs clés du type `Task`
```ts
{ id, title, status, type, fullPlanId, issueNumber, branch, pushed,
  logs, usage, totalUsage, planUsage, implUsage,
  hasPlan, hasPatch, atlasEnabled }
```

### Flags dérivés (calculés à la lecture)
- `hasPlan` — fichier `.plan.md` présent sur disque
- `hasPatch` — au moins un `.patch` dans le dossier patches

## Protocole d'entrée

Pour toute modification dans ce cluster :
1. Lire `src/lib/server/services/tasks.ts` en entier (type Task, statuts, CRUD)
2. Lire `src/lib/components/TaskList.svelte` — comprendre quels boutons déclenchent quelles routes
3. Cibler la route API concernée avec `offset`/`limit`

## Expérience accumulée

### Pitfalls connus
_(vide — se remplit après les issues)_

### Patterns validés
_(vide)_

### Leçons d'issues passées

| Issue | Date | Leçon |
|---|---|---|
