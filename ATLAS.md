# Atlas — Claudicator
_Généré pour : Issue #257 — usecase: merge task_

## Points d'entrée (issue #257)

Ces symboles ont été identifiés comme pertinents :

| Symbole | Fichier | Signature |
|---|---|---|
| `unregister` | `src/lib/server/services/processes.ts` | `unregister(taskId)` |
| `mergeBranch` | `src/lib/server/services/git.ts` | `mergeBranch(root, branch)` |
| `mergePullRequest` | `src/lib/server/services/github.ts` | `mergePullRequest(owner, repo, pullNumber)` |
| `/api/tasks/[id]/commit` | `src/routes/api/tasks/[id]/commit/+server.ts` | `POST` — Tâches — commite les changements sur la branche de la tâche (POST) |
| `/api/tasks/[id]/merge` | `src/routes/api/tasks/[id]/merge/+server.ts` | `POST` — Tâches — crée une PR et merge la branche de la tâche (POST) |
| `/api/cartography/comment` | `src/routes/api/cartography/comment/+server.ts` | `GET, POST` — Cartographie — génère un commentaire pour une méthode via Claude (POST) |

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
