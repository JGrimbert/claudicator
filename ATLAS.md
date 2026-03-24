# Atlas — Claudicator
_Généré pour le groupe : token (6 issues)_

## Points d'entrée — token

Ces symboles ont été identifiés comme pertinents pour le groupe :

| Symbole | Fichier | Signature |
|---|---|---|
| `deleteTask` | `src/lib/server/services/tasks.ts` | `deleteTask(id)` |
| `askClaude` | `src/lib/server/services/claude.ts` | `askClaude(prompt)` |
| `unregister` | `src/lib/server/services/processes.ts` | `unregister(taskId)` |
| `/api/usage` | `src/routes/api/usage/+server.ts` | `GET` — Usage — retourne la consommation de tokens du projet (GET) |
| `/api/plan` | `src/routes/api/plan/+server.ts` | `GET` — Plans — retourne le plan global d'une issue (GET) |
| `/api/tasks` | `src/routes/api/tasks/+server.ts` | `GET, POST` — Tâches — liste toutes les tâches ou en crée une (GET, POST) |
| `TaskList` | `src/lib/components/TaskList.svelte` | `taskToFilter, resetTask, taskPrefix, loadTasks, loadTasksSilent, selectTask, loadLinkedIssueState, skipPlan, loadPlan` — composant UI |
| `AgentInput` | `src/lib/components/AgentInput.svelte` | `parseByKeys, toggleSec, startEditPlan, cancelEditPlan, savePlan, reloadPlan` — composant UI |

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

### `askClaude`
_src/lib/server/services/claude.ts_

```ts
function askClaude(prompt: string) {
    const escaped = prompt.replace(/"/g, '\\"');

    const output = execSync(`claude "${escaped}"`, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 20
    });

    return output;
}
```

### `unregister`
_src/lib/server/services/processes.ts_

```ts
function unregister(taskId: string) {
    active.delete(taskId);
}
```
