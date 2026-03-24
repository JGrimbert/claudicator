# Atlas — Claudicator
_Généré pour : Issue #261 — Usecase et symboles_

## Points d'entrée (issue #261)

Ces symboles ont été identifiés comme pertinents :

| Symbole | Fichier | Signature |
|---|---|---|
| `unregister` | `src/lib/server/services/processes.ts` | `unregister(taskId)` |
| `mergeBranch` | `src/lib/server/services/git.ts` | `mergeBranch(root, branch)` |
| `updateIssue` | `src/lib/server/services/github.ts` | `updateIssue(owner, repo, number, changes)` |
| `/api/tasks/[id]/commit` | `src/routes/api/tasks/[id]/commit/+server.ts` | `POST` — Tâches — commite les changements sur la branche de la tâche (POST) |
| `/api/tasks/[id]/merge` | `src/routes/api/tasks/[id]/merge/+server.ts` | `POST` — Tâches — crée une PR et merge la branche de la tâche (POST) |
| `/api/tasks/[id]/methods` | `src/routes/api/tasks/[id]/methods/+server.ts` | `GET` — Tâches — retourne les méthodes pertinentes pour la tâche (GET) |

---

## Snippets

### `unregister`
_src/lib/server/services/processes.ts_

```ts
function unregister(taskId: string) {
    active.delete(taskId);
}
```

### `mergeBranch`
_src/lib/server/services/git.ts_

```ts
async function mergeBranch(root: string, branch: string): Promise<void> {
    const g = simpleGit(root);
    const branches = await g.branchLocal();
    const mainBranch = branches.all.includes("main") ? "main" : "master";
    await g.checkout(mainBranch);
    await g.merge(["--no-ff", branch]);
}
```
