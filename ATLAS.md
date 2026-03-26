# Atlas — Claudicator
_Généré pour : Issue #284 — Task de type fullplan_

## Points d'entrée (issue #284)

Ces symboles ont été identifiés comme pertinents :

| Symbole | Fichier | Signature |
|---|---|---|
| `deleteTask` | `src/lib/server/services/tasks.ts` | `deleteTask(id)` |
| `getTasksDir` | `src/lib/server/services/tasks.ts` | `getTasksDir()` |
| `listTasks` | `src/lib/server/services/tasks.ts` | `listTasks()` |
| `/api/tasks/[id]/plan` | `src/routes/api/tasks/[id]/plan/+server.ts` | `GET, POST, PUT` — Tâches — lit le plan de la tâche depuis le disque (GET) ou le sauvegarde (POST) |
| `/api/plan` | `src/routes/api/plan/+server.ts` | `GET` — Plans — retourne le plan global d'une issue (GET) |
| `/api/tasks` | `src/routes/api/tasks/+server.ts` | `GET, POST` — Tâches — liste toutes les tâches ou en crée une (GET, POST) |
| `TaskList` | `src/lib/components/TaskList.svelte` | `taskToFilter, resetTask, taskPrefix, loadTasks, loadTasksSilent, selectTask` — composant UI |
| `IssueAnalysis` | `src/lib/components/IssueAnalysis.svelte` | `loadTaskStatuses, createTasks, planTasks` — composant UI |

---

## Snippets

### `deleteTask`
_src/lib/server/services/tasks.ts_

```ts
function deleteTask(id: string): boolean {
    const p = taskPath(id);
    if (!fs.existsSync(p)) return false;
    fs.unlinkSync(p);
    return true;
}
```

### `getTasksDir`
_src/lib/server/services/tasks.ts_

```ts
function getTasksDir(): string {
    const id = getCurrentProject()?.id ?? "default";
    return id === "default" ? ".agent/tasks" : path.join(".agent/tasks", id);
}
```
