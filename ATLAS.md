# Atlas — Claudicator
_Généré pour : Issue #260 — Bugs refresh issue list_

## Points d'entrée (issue #260)

Ces symboles ont été identifiés comme pertinents :

| Symbole | Fichier | Signature |
|---|---|---|
| `closeIssue` | `src/lib/server/services/github.ts` | `closeIssue(owner, repo, issueNumber)` |
| `getIssue` | `src/lib/server/services/github.ts` | `getIssue(owner, repo, number)` |
| `getIssueSlots` | `src/lib/server/services/git-history.ts` | `getIssueSlots()` |
| `/api/issue` | `src/routes/api/issue/+server.ts` | `GET, PATCH, POST` — GitHub — lit une issue avec ses sous-issues (GET) |
| `/api/github/issues` | `src/routes/api/github/issues/+server.ts` | `POST` — GitHub — crée une issue dans le dépôt courant (POST) |
| `/api/issues` | `src/routes/api/issues/+server.ts` | `GET, POST` — GitHub — liste toutes les issues du projet (GET) |
| `ProjetPanel` | `src/lib/components/ProjetPanel.svelte` | `loadIssues, closeIssue, createTaskFromIssue, selectIssue` — composant UI |
| `TaskList` | `src/lib/components/TaskList.svelte` | `onRefreshTick, loadLinkedIssueState, closeLinkedIssue` — composant UI |

---

## Snippets

### `closeIssue`
_src/lib/server/services/github.ts_

```ts
async function closeIssue(owner: string, repo: string, issueNumber: number): Promise<void> {
    const octokit = getOctokit();
    await octokit.issues.update({ owner, repo, issue_number: issueNumber, state: "closed" });
}
```

### `getIssue`
_src/lib/server/services/github.ts_

```ts
async function getIssue(owner: string, repo: string, number: number) {
    const octokit = getOctokit();
    const { data } = await octokit.issues.get({
        owner,
        repo,
        issue_number: number
    });
    return data;
}
```
