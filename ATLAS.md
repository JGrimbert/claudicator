# Atlas — Claudicator
_Généré pour : Issue #306 — spinner creation issue_

## Points d'entrée (issue #306)

Ces symboles ont été identifiés comme pertinents :

| Symbole | Fichier | Signature |
|---|---|---|
| `getIssue` | `src/lib/server/services/github.ts` | `getIssue(owner, repo, number)` |
| `closeIssue` | `src/lib/server/services/github.ts` | `closeIssue(owner, repo, issueNumber)` |
| `getIssueSlots` | `src/lib/server/services/git-history.ts` | `getIssueSlots()` |
| `/api/github/issues` | `src/routes/api/github/issues/+server.ts` | `POST` — GitHub — crée une issue dans le dépôt courant (POST) |
| `/api/issue` | `src/routes/api/issue/+server.ts` | `GET, PATCH, POST` — GitHub — lit une issue avec ses sous-issues (GET) |
| `/api/issues` | `src/routes/api/issues/+server.ts` | `GET, POST` — GitHub — liste toutes les issues du projet (GET) |
| `TaskDetail` | `src/lib/components/TaskDetail.svelte` | `loadLinkedIssueState, closeFullPlanIssues, selectIssueRow, repromptIssue, closeLinkedIssue, writeTests, runTests` — composant UI |
| `FullPlanView` | `src/lib/components/FullPlanView.svelte` | `closeAllIssues, parseStacks, launchDagRow, launchDagRows, isRowLocked` — composant UI |

---

## Snippets

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

### `closeIssue`
_src/lib/server/services/github.ts_

```ts
async function closeIssue(owner: string, repo: string, issueNumber: number): Promise<void> {
    const octokit = getOctokit();
    await octokit.issues.update({ owner, repo, issue_number: issueNumber, state: "closed" });
}
```
