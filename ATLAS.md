# Atlas — Claudicator
_Généré pour : Issue #267 — Mode de création stack de issues_

## Points d'entrée (issue #267)

Ces symboles ont été identifiés comme pertinents :

| Symbole | Fichier | Signature |
|---|---|---|
| `detectPotentialDuplicates` | `src/lib/server/agent/issue-analysis.ts` | `detectPotentialDuplicates(issues)` |
| `createIssuePlan` | `src/lib/server/agent/issue.ts` | `createIssuePlan(issueNumber)` |
| `deleteTask` | `src/lib/server/services/tasks.ts` | `deleteTask(id)` |
| `/api/issues/roadmap/chat` | `src/routes/api/issues/roadmap/chat/+server.ts` | `POST` — Issues — endpoint de chat pour l'agent roadmap (POST) |
| `/api/issues` | `src/routes/api/issues/+server.ts` | `GET, POST` — GitHub — liste toutes les issues du projet (GET) |
| `/api/issues/analysis` | `src/routes/api/issues/analysis/+server.ts` | `GET` — Issues — déclenche l'analyse d'issues via Claude (POST) |
| `PlanPanel` | `src/lib/components/PlanPanel.svelte` | `groupIssuesByPlanGroup, toggleSkillCand, loadSkills, generateSkills` — composant UI |
| `TaskList` | `src/lib/components/TaskList.svelte` | `loadLinkedIssueState, toggleAtlas, generateAtlas, skipPlan, loadPlan` — composant UI |

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

### `createIssuePlan`
_src/lib/server/agent/issue.ts_

```ts
async function createIssuePlan(issueNumber: number) {

    emitLog("INFO", `Chargement de l'issue #${issueNumber}`);

    const { owner, repo } = await getRemoteRepo();
    emitLog("INFO", `Dépôt détecté : ${owner}/${repo}`);

    const issue = await getIssue(owner, repo, issueNumber);
    emitLog("INFO", `Issue récupérée : ${issue.title}`);

    fs.mkdirSync(".agent/issues", { recursive: true });
    fs.mkdirSync("plans", { recursive: true });

    const issuePath = `.agent/issues/${issueNumber}.md`;

    const text = `
# Issue ${issueNumber}

## Title
${issue.title}

## Description
${issue.body}
`;

    fs.writeFileSync(issuePath, text);
    emitLog("INFO", `Issue sauvegardée dans ${issuePath}`);

    const prompt = `
Lis ce fichier :

${issuePath}

Produit un plan d'implémentation détaillé.
Format markdown.
Ne code pas.
`;

    emitLog("INFO", "Génération du plan avec Claude...");
    const plan = askClaude(prompt);
    emitLog("SUCCESS", "Plan généré");

    const planPath = `plans/issue-${issueNumber}-global.md`;
    fs.writeFileSync(planPath, plan);
    emitLog("INFO", `Plan sauvegardé dans ${planPath}`);

    return {
        planPath,
        plan
    };
}
```
