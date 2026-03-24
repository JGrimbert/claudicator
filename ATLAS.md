# Atlas — Claudicator
_Généré pour : Issue #249 — Refound Atlas dans plan_

## Points d'entrée (issue #249)

Ces symboles ont été identifiés comme pertinents :

| Symbole | Fichier | Signature |
|---|---|---|
| `detectPotentialDuplicates` | `src/lib/server/agent/issue-analysis.ts` | `detectPotentialDuplicates(issues)` |
| `findOpenPullRequest` | `src/lib/server/services/github.ts` | `findOpenPullRequest(owner, repo, head, base)` |
| `generateAtlasStrings` | `src/lib/server/services/cartography.ts` | `generateAtlasStrings(projectRoot, query)` |

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

### `findOpenPullRequest`
_src/lib/server/services/github.ts_

```ts
async function findOpenPullRequest(owner: string, repo: string, head: string, base: string) {
    const octokit = getOctokit();
    const { data } = await octokit.pulls.list({ owner, repo, state: "open", head: `${owner}:${head}`, base });
    return data[0] ?? null;
}
```
