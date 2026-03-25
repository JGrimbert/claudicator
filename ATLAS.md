# Atlas — Claudicator
_Généré pour : Issue #265 — usecase: lance l'édition d'une issue_

## Points d'entrée (issue #265)

Ces symboles ont été identifiés comme pertinents :

| Symbole | Fichier | Signature |
|---|---|---|
| `detectPotentialDuplicates` | `src/lib/server/agent/issue-analysis.ts` | `detectPotentialDuplicates(issues)` |
| `getIssue` | `src/lib/server/services/github.ts` | `getIssue(owner, repo, number)` |
| `closeIssue` | `src/lib/server/services/github.ts` | `closeIssue(owner, repo, issueNumber)` |
| `/api/issues/roadmap/reprocess-group` | `src/routes/api/issues/roadmap/reprocess-group/+server.ts` | `POST` — Roadmap — retire les issues fermées d'un groupe dans le Markdown (POST) |
| `/api/github/issues` | `src/routes/api/github/issues/+server.ts` | `POST` — GitHub — crée une issue dans le dépôt courant (POST) |
| `/api/issues` | `src/routes/api/issues/+server.ts` | `GET, POST` — GitHub — liste toutes les issues du projet (GET) |
| `ProjetPanel` | `src/lib/components/ProjetPanel.svelte` | `loadIssues, closeIssue, createTaskFromIssue, selectIssue` — composant UI |
| `PlanPanel` | `src/lib/components/PlanPanel.svelte` | `openIssue, groupIssuesByPlanGroup, toggleSkillCand` — composant UI |

---

## Snippets

### `detectPotentialDuplicates`
_src/lib/server/agent/issue-analysis.ts_

```ts
function detectPotentialDuplicates(issues: IssueInput[]): Map<number, number> {
    const result = new Map<number, number>();
    for (let i = 0; i < issues.length; i++) {
        for (let j = i + 1; j < issues.length; j++) {
            if (!result.has(issues[j].number)) {
                const score = jaccardWords(issues[i].title, issues[j].title);
                if (score > 0.5) result.set(issues[j].number, issues[i].number);
            }
        }
    }
    return result;
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
