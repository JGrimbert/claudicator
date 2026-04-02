# Atlas — Claudicator
_Généré pour le groupe : task (13 issues)_

## Points d'entrée — task

Ces symboles ont été identifiés comme pertinents pour le groupe :

| Symbole | Fichier | Signature |
|---|---|---|
| `listTasks` | `src/lib/server/services/tasks.ts` | `listTasks()` |
| `deleteTask` | `src/lib/server/services/tasks.ts` | `deleteTask(id)` |
| `getTask` | `src/lib/server/services/tasks.ts` | `getTask(id)` |
| `/api/tasks/[id]/commit-all-patches` | `src/routes/api/tasks/[id]/commit-all-patches/+server.ts` | `POST` — POST /api/tasks/[id]/commit-all-patches Pour chaque patch : git apply → git add  |
| `/api/tasks/[id]/plan` | `src/routes/api/tasks/[id]/plan/+server.ts` | `GET, POST, PUT` — Tâches — lit le plan de la tâche depuis le disque (GET) ou le sauvegarde (POST) |
| `/api/tasks` | `src/routes/api/tasks/+server.ts` | `GET, POST` — Tâches — liste toutes les tâches ou en crée une (GET, POST) |
| `TaskDetail` | `src/lib/components/TaskDetail.svelte` | `loadLinkedIssueState, writeTests, runTests, initTask, resetTask, markTaskImplemented, loadDiff, createBranchAndShowDiff, loadPlan, closeFullPlanIssues, skipPlan, btnVariant, closeLinkedIssue, sendCentralInput, repromptIssue, repromptAllStale, selectIssueRow` — composant UI |
| `IssueAnalysis` | `src/lib/components/IssueAnalysis.svelte` | `loadTaskStatuses, createTasks, planTasks, openIssue, loadRoadmaps, onRoadmapChange, createNewRoadmap, parseGroups` — composant UI |

---

## Snippets

### `listTasks`
_src/lib/server/services/tasks.ts_

```ts
function listTasks(): Task[] {
    ensureDir();
    const dir = getTasksDir();
    return fs.readdirSync(dir)
        .filter(f => f.endsWith(".json"))
        .map(f => {
            const task = migrateTaskStatus(JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
            task.hasPlan = fs.existsSync(path.join(dir, `${task.id}.plan.md`));
            task.hasPatch = hasPatchFiles(task.id);
            return task;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
```

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

### `getTask`
_src/lib/server/services/tasks.ts_

```ts
function getTask(id: string): Task | null {
    const p = taskPath(id);
    if (!fs.existsSync(p)) return null;
    return migrateTaskStatus(JSON.parse(fs.readFileSync(p, "utf-8")));
}
```
