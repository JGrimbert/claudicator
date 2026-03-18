# Roadmap
> Project: **claudicator**

*Generated: 2026-03-18T10:10:49.764Z*

## Stats

| Metric | Value |
|--------|-------|
| Nodes  | 207 |
| Edges  | 304 |
| Levels | 8 |
| Steps  | 126 |

## Spine (chemin critique — 8 nœuds)

`save` → `load` → `getCurrentProject` → `getTasksDir` → `taskPath` → `getTask` → `updateTask` → `api.agent.kill.POST`

## Concepts (73 fichiers)

| Concept | Skill | Nœuds | Cohésion |
|---------|-------|------:|---------|
| github | utility | 15 | 0.93 |
| git-history | utility | 14 | 0.93 |
| git | utility | 14 | 1.00 |
| comment | internal | 10 | 0.77 |
| cartography | utility | 9 | 0.77 |
| issue-analysis | utility | 9 | 1.00 |
| tasks | utility | 9 | 0.93 |
| projects | utility | 8 | 1.00 |
| claude-session | utility | 7 | 0.67 |
| diagram | internal | 6 | 0.71 |
| processes | utility | 6 | 0.00 |
| context | utility | 5 | 0.27 |
| prompt | utility | 5 | 0.00 |
| agent | utility | 5 | 0.00 |
| cartography | internal | 4 | 0.60 |
| usage | utility | 3 | 1.00 |
| run | internal | 3 | 0.11 |
| clusters | internal | 3 | 0.29 |
| issue | utility | 3 | 0.00 |
| analyze | internal | 3 | 0.22 |
| id | utility | 3 | 0.00 |
| methods | internal | 3 | 0.40 |
| project-config | utility | 3 | 0.75 |
| issues | utility | 2 | 0.00 |
| project-config | utility | 2 | 0.00 |
| projects | utility | 2 | 0.00 |
| current | utility | 2 | 0.00 |
| tasks | utility | 2 | 0.00 |
| initial-commit | utility | 2 | 0.14 |
| orchestrator | utility | 2 | 0.11 |
| input | utility | 1 | 0.00 |
| kill | utility | 1 | 0.00 |
| preview-prompt | utility | 1 | 0.00 |
| session | utility | 1 | 0.00 |
| atlas | utility | 1 | 0.00 |
| enrich | utility | 1 | 0.00 |
| methods | utility | 1 | 0.00 |
| refresh | utility | 1 | 0.00 |
| run | utility | 1 | 0.00 |
| snippet | utility | 1 | 0.00 |
| stats | utility | 1 | 0.00 |
| context | utility | 1 | 0.00 |
| git-history | utility | 1 | 0.00 |
| run | utility | 1 | 0.00 |
| issues | utility | 1 | 0.00 |
| close | utility | 1 | 0.00 |
| analysis | utility | 1 | 0.00 |
| update | utility | 1 | 0.00 |
| chat | utility | 1 | 0.00 |
| roadmaps | utility | 1 | 0.00 |
| snapshot | utility | 1 | 0.00 |
| logs | utility | 1 | 0.00 |
| plan | utility | 1 | 0.00 |
| github | utility | 1 | 0.00 |
| repo-file | utility | 1 | 0.00 |
| repo-info | utility | 1 | 0.00 |
| skills | utility | 1 | 0.00 |
| symbol | utility | 1 | 0.00 |
| commit | utility | 1 | 0.00 |
| diff | utility | 1 | 0.00 |
| merge | utility | 1 | 0.00 |
| plan | utility | 1 | 0.00 |
| push | utility | 1 | 0.00 |
| revert | utility | 1 | 0.00 |
| sync | utility | 1 | 0.00 |
| usage | utility | 1 | 0.00 |
| claude | utility | 1 | 0.00 |
| segments | utility | 1 | 0.00 |
| issue | utility | 1 | 0.00 |
| logs | utility | 1 | 0.00 |
| hooks.server | internal | 1 | 0.00 |
| skills | utility | 1 | 0.00 |
| claude-stream | utility | 1 | 0.00 |

## Steps

### Step 1 · Core: cartography

*No prerequisites*
*Parallelizable with: Steps 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `adaptiveCap` → `src\lib\server\services\cartography.ts`
- `buildAtlasText` → `src\lib\server\services\cartography.ts`

### Step 2 · Service: comment

*No prerequisites*
*Parallelizable with: Steps 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `buildFileGraph` → `src\routes\api\cartography\comment\+server.ts`
- `computeDepths` → `src\routes\api\cartography\comment\+server.ts`
- `extractCode` → `src\routes\api\cartography\comment\+server.ts`
- `generateDescriptions` → `src\routes\api\cartography\comment\+server.ts`
- `insertJsDoc` → `src\routes\api\cartography\comment\+server.ts`

### Step 3 · Service: comment

*No prerequisites*
*Parallelizable with: Steps 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `readIndex` → `src\routes\api\cartography\comment\+server.ts`
- `topoSort` → `src\routes\api\cartography\comment\+server.ts`

### Step 4 · Service: diagram

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `buildFolderTree` → `src\routes\api\cartography\diagram\+server.ts`
- `capitalize` → `src\routes\api\cartography\diagram\+server.ts`
- `extractExtends` → `src\routes\api\cartography\diagram\+server.ts`
- `makeFileNode` → `src\routes\api\cartography\diagram\+server.ts`
- `scanJs` → `src\routes\api\cartography\diagram\+server.ts`

### Step 5 · Flow: context

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `buildQuery` → `src\lib\server\agent\context.ts`
- `truncateSnippet` → `src\lib\server\agent\context.ts`

### Step 6 · Service: cartography

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `extractKeywords` → `src\routes\api\cartography\+server.ts`
- `walkSrc` → `src\routes\api\cartography\+server.ts`

### Step 7 · Service: methods

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `extractSnippet` → `src\routes\api\tasks\[id]\methods\+server.ts`
- `getVueScriptOffset` → `src\routes\api\tasks\[id]\methods\+server.ts`

### Step 8 · Core: github

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `getPrivateKey` → `src\lib\server\services\github.ts`

### Step 9 · Core: git-history

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `historyDir` → `src\lib\server\services\git-history.ts`

### Step 10 · Flow: issue-analysis

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `injectDiagram` → `src\lib\server\agent\issue-analysis.ts`
- `jaccardWords` → `src\lib\server\agent\issue-analysis.ts`

### Step 11 · Core: usage

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `loadUsage` → `src\lib\server\services\usage.ts`

### Step 12 · Service: clusters

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `makeUF` → `src\routes\api\clusters\+server.ts`
- `parentDir` → `src\routes\api\clusters\+server.ts`

### Step 13 · Core: tasks

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `migrateTaskStatus` → `src\lib\server\services\tasks.ts`

### Step 14 · adapter: agent

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `parseGroups` → `src\lib\stores\agent.ts`

### Step 15 · Core: claude-session

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `processStdoutLine` → `src\lib\server\services\claude-session.ts`

### Step 16 · Core: projects

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `save` → `src\lib\server\services\projects.ts`

### Step 17 · Service: analyze

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `saveAnalysis` → `src\routes\api\issues\analyze\+server.ts`
- `saveSnapshot` → `src\routes\api\issues\analyze\+server.ts`

### Step 18 · Flow: orchestrator

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `spawnClaudeOneShot` → `src\lib\server\agent\orchestrator.ts`

### Step 19 · Service: run

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `stripAnsi` → `src\routes\api\agent\run\+server.ts`

### Step 20 · Service: initial-commit

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `toBranchName` → `src\routes\api\tasks\[id]\initial-commit\+server.ts`

### Step 21 · Service: analysis

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `api.issues.analysis.GET` → `src\routes\api\issues\analysis\+server.ts`

### Step 22 · Service: roadmaps

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `api.issues.roadmaps.GET` → `src\routes\api\issues\roadmaps\+server.ts`

### Step 23 · Service: snapshot

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `api.issues.snapshot.GET` → `src\routes\api\issues\snapshot\+server.ts`

### Step 24 · Service: logs

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `api.logs.GET` → `src\routes\api\logs\+server.ts`

### Step 25 · Service: plan

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `api.plan.GET` → `src\routes\api\plan\+server.ts`

### Step 26 · Service: skills

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `api.skills.GET` → `src\routes\api\skills\+server.ts`

### Step 27 · Core: claude

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `askClaude` → `src\lib\server\services\claude.ts`

### Step 28 · Flow: issue-analysis

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `buildChatPrompt` → `src\lib\server\agent\issue-analysis.ts`
- `buildFocusedPrompt` → `src\lib\server\agent\issue-analysis.ts`
- `summarizeIssueBody` → `src\lib\server\agent\issue-analysis.ts`

### Step 29 · Core: git-history

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `buildHistoricalCoal` → `src\lib\server\services\git-history.ts`
- `parseIssueRefs` → `src\lib\server\services\git-history.ts`

### Step 30 · Flow: segments

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `classifyFile` → `src\lib\server\agent\segments.ts`

### Step 31 · Core: git

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `commit` → `src\lib\server\services\git.ts`
- `createBranch` → `src\lib\server\services\git.ts`
- `getCommitFiles` → `src\lib\server\services\git.ts`
- `getCommitLog` → `src\lib\server\services\git.ts`
- `getDiff` → `src\lib\server\services\git.ts`

### Step 32 · Core: git

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `getHeadCommit` → `src\lib\server\services\git.ts`
- `getMainBranch` → `src\lib\server\services\git.ts`
- `getRemoteRepo` → `src\lib\server\services\git.ts`
- `mergeBranch` → `src\lib\server\services\git.ts`
- `pushBranch` → `src\lib\server\services\git.ts`

### Step 33 · Core: git

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `revertAll` → `src\lib\server\services\git.ts`

### Step 34 · Core: claude-session

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 35, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `destroySession` → `src\lib\server\services\claude-session.ts`
- `isSessionAlive` → `src\lib\server\services\claude-session.ts`
- `isSessionBusy` → `src\lib\server\services\claude-session.ts`
- `sendTurn` → `src\lib\server\services\claude-session.ts`

### Step 35 · Utility: logs

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 37, 38, 39, 40*

> Foundational — no dependencies

- `emitLog` → `src\lib\server\logs.ts`

### Step 36 · Flow: prompt

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 37, 38, 39, 40*

> Foundational — no dependencies

- `formatImplementationPrompt` → `src\lib\server\agent\prompt.ts`
- `formatPrompt` → `src\lib\server\agent\prompt.ts`
- `loadConceptMap` → `src\lib\server\agent\prompt.ts`
- `loadProjectDiagram` → `src\lib\server\agent\prompt.ts`
- `loadProjectDocs` → `src\lib\server\agent\prompt.ts`

### Step 37 · Core: processes

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 38, 39, 40*

> Foundational — no dependencies

- `getProcess` → `src\lib\server\services\processes.ts`
- `isRunning` → `src\lib\server\services\processes.ts`
- `killProcess` → `src\lib\server\services\processes.ts`
- `register` → `src\lib\server\services\processes.ts`
- `unregister` → `src\lib\server\services\processes.ts`

### Step 38 · Core: processes

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 39, 40*

> Foundational — no dependencies

- `writeInput` → `src\lib\server\services\processes.ts`

### Step 39 · adapter: agent

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 40*

> Foundational — no dependencies

- `notifyTaskCreated` → `src\lib\stores\agent.ts`
- `startConsoleStream` → `src\lib\stores\agent.ts`
- `stopConsoleStream` → `src\lib\stores\agent.ts`
- `toggleConsoleMinimized` → `src\lib\stores\agent.ts`

### Step 40 · Flow: skills

*No prerequisites*
*Parallelizable with: Steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39*

> Foundational — no dependencies

- `selectSkill` → `src\lib\server\agent\skills.ts`

### Step 41 · Core: usage

*Requires: Steps 11*
*Parallelizable with: Steps 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52*

> Depends on 1 prior step

- `addProjectUsage` → `src\lib\server\services\usage.ts`
- `getProjectUsage` → `src\lib\server\services\usage.ts`

### Step 42 · Service: input

*Requires: Steps 37, 38*
*Parallelizable with: Steps 41, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52*

> Depends on 2 prior steps

- `api.agent.input.POST` → `src\routes\api\agent\input\+server.ts`

### Step 43 · Flow: issue-analysis

*Requires: Steps 10*
*Parallelizable with: Steps 41, 42, 44, 45, 46, 47, 48, 49, 50, 51, 52*

> Depends on 1 prior step

- `buildAnalysisPrompt` → `src\lib\server\agent\issue-analysis.ts`
- `buildUpdatePrompt` → `src\lib\server\agent\issue-analysis.ts`
- `detectPotentialDuplicates` → `src\lib\server\agent\issue-analysis.ts`

### Step 44 · Core: git

*Requires: Steps 31, 32*
*Parallelizable with: Steps 41, 42, 43, 45, 46, 47, 48, 49, 50, 51, 52*

> Depends on 2 prior steps

- `checkoutMain` → `src\lib\server\services\git.ts`
- `commitAll` → `src\lib\server\services\git.ts`
- `getBranchState` → `src\lib\server\services\git.ts`

### Step 45 · Core: claude-session

*Requires: Steps 15, 19, 34*
*Parallelizable with: Steps 41, 42, 43, 44, 46, 47, 48, 49, 50, 51, 52*

> Depends on 3 prior steps

- `createSession` → `src\lib\server\services\claude-session.ts`
- `destroyAllSessions` → `src\lib\server\services\claude-session.ts`

### Step 46 · Flow: claude-stream

*Requires: Steps 19*
*Parallelizable with: Steps 41, 42, 43, 44, 45, 47, 48, 49, 50, 51, 52*

> Depends on 1 prior step

- `spawnClaudeStream` → `src\lib\server\agent\claude-stream.ts`

### Step 47 · Core: cartography

*Requires: Steps 6*
*Parallelizable with: Steps 41, 42, 43, 44, 45, 46, 48, 49, 50, 51, 52*

> Depends on 1 prior step

- `buildAtlasDeps` → `src\lib\server\services\cartography.ts`

### Step 48 · Core: git-history

*Requires: Steps 9*
*Parallelizable with: Steps 41, 42, 43, 44, 45, 46, 47, 49, 50, 51, 52*

> Depends on 1 prior step

- `commitsDir` → `src\lib\server\services\git-history.ts`
- `statePath` → `src\lib\server\services\git-history.ts`

### Step 49 · Service: cartography

*Requires: Steps 6*
*Parallelizable with: Steps 41, 42, 43, 44, 45, 46, 47, 48, 50, 51, 52*

> Depends on 1 prior step

- `fileNameSearch` → `src\routes\api\cartography\+server.ts`

### Step 50 · Core: github

*Requires: Steps 8*
*Parallelizable with: Steps 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 52*

> Depends on 1 prior step

- `getOctokit` → `src\lib\server\services\github.ts`

### Step 51 · Service: comment

*Requires: Steps 3*
*Parallelizable with: Steps 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 52*

> Depends on 1 prior step

- `getUndescribedByFile` → `src\routes\api\cartography\comment\+server.ts`

### Step 52 · Core: projects

*Requires: Steps 16*
*Parallelizable with: Steps 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51*

> Depends on 1 prior step

- `load` → `src\lib\server\services\projects.ts`

### Step 53 · Core: projects

*Requires: Steps 16, 52*
*Parallelizable with: Steps 54, 55, 56, 57, 58, 59, 60*

> Depends on 2 prior steps

- `addProject` → `src\lib\server\services\projects.ts`
- `getCurrentProject` → `src\lib\server\services\projects.ts`
- `listProjects` → `src\lib\server\services\projects.ts`
- `removeProject` → `src\lib\server\services\projects.ts`
- `setCurrentProject` → `src\lib\server\services\projects.ts`

### Step 54 · Service: usage

*Requires: Steps 41*
*Parallelizable with: Steps 53, 55, 56, 57, 58, 59, 60*

> Depends on 1 prior step

- `api.usage.GET` → `src\routes\api\usage\+server.ts`

### Step 55 · Core: github

*Requires: Steps 50*
*Parallelizable with: Steps 53, 54, 56, 57, 58, 59, 60*

> Depends on 1 prior step

- `closeIssue` → `src\lib\server\services\github.ts`
- `createIssue` → `src\lib\server\services\github.ts`
- `createPullRequest` → `src\lib\server\services\github.ts`
- `findOpenPullRequest` → `src\lib\server\services\github.ts`
- `getIssue` → `src\lib\server\services\github.ts`

### Step 56 · Core: github

*Requires: Steps 50*
*Parallelizable with: Steps 53, 54, 55, 57, 58, 59, 60*

> Depends on 1 prior step

- `getIssues` → `src\lib\server\services\github.ts`
- `getIssuesWithBodies` → `src\lib\server\services\github.ts`
- `getRepoFile` → `src\lib\server\services\github.ts`
- `getSubIssues` → `src\lib\server\services\github.ts`
- `listAccessibleRepos` → `src\lib\server\services\github.ts`

### Step 57 · Core: github

*Requires: Steps 50*
*Parallelizable with: Steps 53, 54, 55, 56, 58, 59, 60*

> Depends on 1 prior step

- `mergePullRequest` → `src\lib\server\services\github.ts`
- `updateIssue` → `src\lib\server\services\github.ts`

### Step 58 · Core: git-history

*Requires: Steps 48*
*Parallelizable with: Steps 53, 54, 55, 56, 57, 59, 60*

> Depends on 1 prior step

- `ensureHistoryDir` → `src\lib\server\services\git-history.ts`
- `isCommitProcessed` → `src\lib\server\services\git-history.ts`
- `saveCommitRecord` → `src\lib\server\services\git-history.ts`
- `saveHistoryState` → `src\lib\server\services\git-history.ts`

### Step 59 · Flow: issue-analysis

*Requires: Steps 28, 43*
*Parallelizable with: Steps 53, 54, 55, 56, 57, 58, 60*

> Depends on 2 prior steps

- `prepareIssues` → `src\lib\server\agent\issue-analysis.ts`

### Step 60 · Core: cartography

*Requires: Steps 52*
*Parallelizable with: Steps 53, 54, 55, 56, 57, 58, 59*

> Depends on 1 prior step

- `ensureLoaded` → `src\lib\server\services\cartography.ts`

### Step 61 · Service: issues

*Requires: Steps 53, 55*
*Parallelizable with: Steps 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79*

> Depends on 2 prior steps

- `api.github.issues.POST` → `src\routes\api\github\issues\+server.ts`

### Step 62 · Service: issue

*Requires: Steps 53, 55, 56, 57*
*Parallelizable with: Steps 61, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79*

> Depends on 4 prior steps

- `api.issue.GET` → `src\routes\api\issue\+server.ts`
- `api.issue.PATCH` → `src\routes\api\issue\+server.ts`

### Step 63 · Service: issues

*Requires: Steps 53, 55, 56*
*Parallelizable with: Steps 61, 62, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79*

> Depends on 3 prior steps

- `api.issues.GET` → `src\routes\api\issues\+server.ts`
- `api.issues.POST` → `src\routes\api\issues\+server.ts`

### Step 64 · Service: close

*Requires: Steps 53, 55*
*Parallelizable with: Steps 61, 62, 63, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79*

> Depends on 2 prior steps

- `api.issues.[number].close.POST` → `src\routes\api\issues\[number]\close\+server.ts`

### Step 65 · Service: analyze

*Requires: Steps 17, 36, 43, 46, 53, 56, 59*
*Parallelizable with: Steps 61, 62, 63, 64, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79*

> Depends on 7 prior steps

- `api.issues.analyze.POST` → `src\routes\api\issues\analyze\+server.ts`

### Step 66 · Service: update

*Requires: Steps 36, 43, 46, 53, 56, 59*
*Parallelizable with: Steps 61, 62, 63, 64, 65, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79*

> Depends on 6 prior steps

- `api.issues.analyze.update.POST` → `src\routes\api\issues\analyze\update\+server.ts`

### Step 67 · Service: chat

*Requires: Steps 28, 46, 53*
*Parallelizable with: Steps 61, 62, 63, 64, 65, 66, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79*

> Depends on 3 prior steps

- `api.issues.roadmap.chat.POST` → `src\routes\api\issues\roadmap\chat\+server.ts`

### Step 68 · Service: projects

*Requires: Steps 53*
*Parallelizable with: Steps 61, 62, 63, 64, 65, 66, 67, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79*

> Depends on 1 prior step

- `api.projects.GET` → `src\routes\api\projects\+server.ts`
- `api.projects.POST` → `src\routes\api\projects\+server.ts`

### Step 69 · Service: current

*Requires: Steps 53*
*Parallelizable with: Steps 61, 62, 63, 64, 65, 66, 67, 68, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79*

> Depends on 1 prior step

- `api.projects.current.DELETE` → `src\routes\api\projects\current\+server.ts`
- `api.projects.current.PATCH` → `src\routes\api\projects\current\+server.ts`

### Step 70 · Service: github

*Requires: Steps 53, 56*
*Parallelizable with: Steps 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 72, 73, 74, 75, 76, 77, 78, 79*

> Depends on 2 prior steps

- `api.projects.github.GET` → `src\routes\api\projects\github\+server.ts`

### Step 71 · Service: repo-file

*Requires: Steps 53, 56*
*Parallelizable with: Steps 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 72, 73, 74, 75, 76, 77, 78, 79*

> Depends on 2 prior steps

- `api.repo-file.GET` → `src\routes\api\repo-file\+server.ts`

### Step 72 · Service: repo-info

*Requires: Steps 53*
*Parallelizable with: Steps 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 73, 74, 75, 76, 77, 78, 79*

> Depends on 1 prior step

- `api.repo-info.GET` → `src\routes\api\repo-info\+server.ts`

### Step 73 · Core: github

*Requires: Steps 50, 53*
*Parallelizable with: Steps 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 74, 75, 76, 77, 78, 79*

> Depends on 2 prior steps

- `createIssueComment` → `src\lib\server\services\github.ts`

### Step 74 · Flow: issue

*Requires: Steps 27, 32, 35, 55*
*Parallelizable with: Steps 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 75, 76, 77, 78, 79*

> Depends on 4 prior steps

- `createIssuePlan` → `src\lib\server\agent\issue.ts`

### Step 75 · Core: git-history

*Requires: Steps 48, 58*
*Parallelizable with: Steps 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 76, 77, 78, 79*

> Depends on 2 prior steps

- `getHistoryState` → `src\lib\server\services\git-history.ts`
- `loadAllCommitRecords` → `src\lib\server\services\git-history.ts`

### Step 76 · Core: projects

*Requires: Steps 53*
*Parallelizable with: Steps 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 77, 78, 79*

> Depends on 1 prior step

- `getProjectRoot` → `src\lib\server\services\projects.ts`

### Step 77 · Core: cartography

*Requires: Steps 1, 52, 60*
*Parallelizable with: Steps 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 78, 79*

> Depends on 3 prior steps

- `getSessionWithCode` → `src\lib\server\services\cartography.ts`
- `getSnippet` → `src\lib\server\services\cartography.ts`
- `refreshIndex` → `src\lib\server\services\cartography.ts`
- `searchMethods` → `src\lib\server\services\cartography.ts`

### Step 78 · Core: tasks

*Requires: Steps 53*
*Parallelizable with: Steps 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 79*

> Depends on 1 prior step

- `getTasksDir` → `src\lib\server\services\tasks.ts`

### Step 79 · Core: project-config

*Requires: Steps 53*
*Parallelizable with: Steps 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78*

> Depends on 1 prior step

- `configFilePath` → `src\lib\server\services\project-config.ts`

### Step 80 · Service: atlas

*Requires: Steps 6, 30, 76*
*Parallelizable with: Steps 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97*

> Depends on 3 prior steps

- `api.atlas.GET` → `src\routes\api\atlas\+server.ts`

### Step 81 · Service: comment

*Requires: Steps 2, 3, 51, 76, 77*
*Parallelizable with: Steps 80, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97*

> Depends on 5 prior steps

- `api.cartography.comment.GET` → `src\routes\api\cartography\comment\+server.ts`
- `api.cartography.comment.POST` → `src\routes\api\cartography\comment\+server.ts`

### Step 82 · Service: diagram

*Requires: Steps 4, 30, 76*
*Parallelizable with: Steps 80, 81, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97*

> Depends on 3 prior steps

- `api.cartography.diagram.GET` → `src\routes\api\cartography\diagram\+server.ts`

### Step 83 · Service: enrich

*Requires: Steps 76*
*Parallelizable with: Steps 80, 81, 82, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97*

> Depends on 1 prior step

- `api.cartography.enrich.POST` → `src\routes\api\cartography\enrich\+server.ts`

### Step 84 · Service: methods

*Requires: Steps 76*
*Parallelizable with: Steps 80, 81, 82, 83, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97*

> Depends on 1 prior step

- `api.cartography.methods.GET` → `src\routes\api\cartography\methods\+server.ts`

### Step 85 · Service: refresh

*Requires: Steps 76, 77*
*Parallelizable with: Steps 80, 81, 82, 83, 84, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97*

> Depends on 2 prior steps

- `api.cartography.refresh.POST` → `src\routes\api\cartography\refresh\+server.ts`

### Step 86 · Service: run

*Requires: Steps 76*
*Parallelizable with: Steps 80, 81, 82, 83, 84, 85, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97*

> Depends on 1 prior step

- `api.cartography.run.POST` → `src\routes\api\cartography\run\+server.ts`

### Step 87 · Service: snippet

*Requires: Steps 7, 76*
*Parallelizable with: Steps 80, 81, 82, 83, 84, 85, 86, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97*

> Depends on 2 prior steps

- `api.cartography.snippet.GET` → `src\routes\api\cartography\snippet\+server.ts`

### Step 88 · Service: stats

*Requires: Steps 76*
*Parallelizable with: Steps 80, 81, 82, 83, 84, 85, 86, 87, 89, 90, 91, 92, 93, 94, 95, 96, 97*

> Depends on 1 prior step

- `api.cartography.stats.GET` → `src\routes\api\cartography\stats\+server.ts`

### Step 89 · Service: clusters

*Requires: Steps 12, 53, 56, 75, 76, 77*
*Parallelizable with: Steps 80, 81, 82, 83, 84, 85, 86, 87, 88, 90, 91, 92, 93, 94, 95, 96, 97*

> Depends on 6 prior steps

- `api.clusters.GET` → `src\routes\api\clusters\+server.ts`

### Step 90 · Service: issue

*Requires: Steps 74*
*Parallelizable with: Steps 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97*

> Depends on 1 prior step

- `api.issue.POST` → `src\routes\api\issue\+server.ts`

### Step 91 · Service: symbol

*Requires: Steps 76, 77*
*Parallelizable with: Steps 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 92, 93, 94, 95, 96, 97*

> Depends on 2 prior steps

- `api.symbol.GET` → `src\routes\api\symbol\+server.ts`

### Step 92 · Core: git-history

*Requires: Steps 75, 77*
*Parallelizable with: Steps 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 93, 94, 95, 96, 97*

> Depends on 2 prior steps

- `findSymbolsForFiles` → `src\lib\server\services\git-history.ts`
- `getHistoryStats` → `src\lib\server\services\git-history.ts`
- `getIssueSlots` → `src\lib\server\services\git-history.ts`

### Step 93 · Core: cartography

*Requires: Steps 1, 47, 60, 77*
*Parallelizable with: Steps 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 94, 95, 96, 97*

> Depends on 4 prior steps

- `generateAtlasStrings` → `src\lib\server\services\cartography.ts`

### Step 94 · Core: project-config

*Requires: Steps 79*
*Parallelizable with: Steps 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 95, 96, 97*

> Depends on 1 prior step

- `getProjectConfig` → `src\lib\server\services\project-config.ts`

### Step 95 · Flow: context

*Requires: Steps 5, 77*
*Parallelizable with: Steps 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 96, 97*

> Depends on 2 prior steps

- `loadMethodSnippets` → `src\lib\server\agent\context.ts`
- `loadSymbolMap` → `src\lib\server\agent\context.ts`

### Step 96 · Core: tasks

*Requires: Steps 78*
*Parallelizable with: Steps 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 97*

> Depends on 1 prior step

- `ensureDir` → `src\lib\server\services\tasks.ts`
- `taskPath` → `src\lib\server\services\tasks.ts`

### Step 97 · Service: run

*Requires: Steps 78*
*Parallelizable with: Steps 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96*

> Depends on 1 prior step

- `savePlan` → `src\routes\api\agent\run\+server.ts`

### Step 98 · Service: cartography

*Requires: Steps 49, 76, 94*
*Parallelizable with: Steps 99, 100, 101, 102, 103, 104*

> Depends on 3 prior steps

- `api.cartography.POST` → `src\routes\api\cartography\+server.ts`

### Step 99 · Service: git-history

*Requires: Steps 32, 58, 75, 76, 92*
*Parallelizable with: Steps 98, 100, 101, 102, 103, 104*

> Depends on 5 prior steps

- `api.git-history.GET` → `src\routes\api\git-history\+server.ts`

### Step 100 · Service: run

*Requires: Steps 29, 31, 58, 75, 76, 92*
*Parallelizable with: Steps 98, 99, 101, 102, 103, 104*

> Depends on 6 prior steps

- `api.git-history.run.POST` → `src\routes\api\git-history\run\+server.ts`

### Step 101 · Service: project-config

*Requires: Steps 94*
*Parallelizable with: Steps 98, 99, 100, 102, 103, 104*

> Depends on 1 prior step

- `api.project-config.GET` → `src\routes\api\project-config\+server.ts`

### Step 102 · Flow: context

*Requires: Steps 5, 30, 36, 40, 93, 95*
*Parallelizable with: Steps 98, 99, 100, 101, 103, 104*

> Depends on 6 prior steps

- `buildContext` → `src\lib\server\agent\context.ts`

### Step 103 · Core: tasks

*Requires: Steps 13, 78, 96*
*Parallelizable with: Steps 98, 99, 100, 101, 102, 104*

> Depends on 3 prior steps

- `deleteTask` → `src\lib\server\services\tasks.ts`
- `getTask` → `src\lib\server\services\tasks.ts`
- `listTasks` → `src\lib\server\services\tasks.ts`

### Step 104 · Core: project-config

*Requires: Steps 79, 94*
*Parallelizable with: Steps 98, 99, 100, 101, 102, 103*

> Depends on 2 prior steps

- `setProjectConfig` → `src\lib\server\services\project-config.ts`

### Step 105 · Service: preview-prompt

*Requires: Steps 36, 76, 93, 95, 103*
*Parallelizable with: Steps 106, 107, 108, 109, 110, 111, 112, 113, 114, 115*

> Depends on 5 prior steps

- `api.agent.preview-prompt.POST` → `src\routes\api\agent\preview-prompt\+server.ts`

### Step 106 · Service: context

*Requires: Steps 53, 55, 76, 102, 103*
*Parallelizable with: Steps 105, 107, 108, 109, 110, 111, 112, 113, 114, 115*

> Depends on 5 prior steps

- `api.context.POST` → `src\routes\api\context\+server.ts`

### Step 107 · Service: project-config

*Requires: Steps 104*
*Parallelizable with: Steps 105, 106, 108, 109, 110, 111, 112, 113, 114, 115*

> Depends on 1 prior step

- `api.project-config.PATCH` → `src\routes\api\project-config\+server.ts`

### Step 108 · Service: tasks

*Requires: Steps 103*
*Parallelizable with: Steps 105, 106, 107, 109, 110, 111, 112, 113, 114, 115*

> Depends on 1 prior step

- `api.tasks.GET` → `src\routes\api\tasks\+server.ts`

### Step 109 · Service: id

*Requires: Steps 103*
*Parallelizable with: Steps 105, 106, 107, 108, 110, 111, 112, 113, 114, 115*

> Depends on 1 prior step

- `api.tasks.[id].DELETE` → `src\routes\api\tasks\[id]\+server.ts`
- `api.tasks.[id].GET` → `src\routes\api\tasks\[id]\+server.ts`

### Step 110 · Service: diff

*Requires: Steps 31, 76, 103*
*Parallelizable with: Steps 105, 106, 107, 108, 109, 111, 112, 113, 114, 115*

> Depends on 3 prior steps

- `api.tasks.[id].diff.GET` → `src\routes\api\tasks\[id]\diff\+server.ts`

### Step 111 · Service: methods

*Requires: Steps 7, 76, 95, 103*
*Parallelizable with: Steps 105, 106, 107, 108, 109, 110, 112, 113, 114, 115*

> Depends on 4 prior steps

- `api.tasks.[id].methods.GET` → `src\routes\api\tasks\[id]\methods\+server.ts`

### Step 112 · Service: plan

*Requires: Steps 78, 103*
*Parallelizable with: Steps 105, 106, 107, 108, 109, 110, 111, 113, 114, 115*

> Depends on 2 prior steps

- `api.tasks.[id].plan.GET` → `src\routes\api\tasks\[id]\plan\+server.ts`

### Step 113 · Service: revert

*Requires: Steps 33, 76, 103*
*Parallelizable with: Steps 105, 106, 107, 108, 109, 110, 111, 112, 114, 115*

> Depends on 3 prior steps

- `api.tasks.[id].revert.POST` → `src\routes\api\tasks\[id]\revert\+server.ts`

### Step 114 · Core: tasks

*Requires: Steps 96, 103*
*Parallelizable with: Steps 105, 106, 107, 108, 109, 110, 111, 112, 113, 115*

> Depends on 2 prior steps

- `createTask` → `src\lib\server\services\tasks.ts`
- `updateTask` → `src\lib\server\services\tasks.ts`

### Step 115 · Flow: orchestrator

*Requires: Steps 18, 30, 36, 40, 77, 93, 102*
*Parallelizable with: Steps 105, 106, 107, 108, 109, 110, 111, 112, 113, 114*

> Depends on 7 prior steps

- `orchestrate` → `src\lib\server\agent\orchestrator.ts`

### Step 116 · Service: kill

*Requires: Steps 37, 114*
*Parallelizable with: Steps 117, 118, 119, 120, 121, 122, 123, 124, 125, 126*

> Depends on 2 prior steps

- `api.agent.kill.POST` → `src\routes\api\agent\kill\+server.ts`

### Step 117 · Service: run

*Requires: Steps 19, 34, 36, 37, 41, 45, 76, 93, 95, 97, 103, 114, 115*
*Parallelizable with: Steps 116, 118, 119, 120, 121, 122, 123, 124, 125, 126*

> Depends on 13 prior steps

- `api.agent.run.POST` → `src\routes\api\agent\run\+server.ts`

### Step 118 · Service: session

*Requires: Steps 34, 103, 114*
*Parallelizable with: Steps 116, 117, 119, 120, 121, 122, 123, 124, 125, 126*

> Depends on 3 prior steps

- `api.agent.session.DELETE` → `src\routes\api\agent\session\+server.ts`

### Step 119 · Service: tasks

*Requires: Steps 103, 114*
*Parallelizable with: Steps 116, 117, 118, 120, 121, 122, 123, 124, 125, 126*

> Depends on 2 prior steps

- `api.tasks.POST` → `src\routes\api\tasks\+server.ts`

### Step 120 · Service: id

*Requires: Steps 114*
*Parallelizable with: Steps 116, 117, 118, 119, 121, 122, 123, 124, 125, 126*

> Depends on 1 prior step

- `api.tasks.[id].PATCH` → `src\routes\api\tasks\[id]\+server.ts`

### Step 121 · Service: commit

*Requires: Steps 44, 76, 103, 114*
*Parallelizable with: Steps 116, 117, 118, 119, 120, 122, 123, 124, 125, 126*

> Depends on 4 prior steps

- `api.tasks.[id].commit.POST` → `src\routes\api\tasks\[id]\commit\+server.ts`

### Step 122 · Service: initial-commit

*Requires: Steps 20, 31, 73, 76, 78, 103, 114*
*Parallelizable with: Steps 116, 117, 118, 119, 120, 121, 123, 124, 125, 126*

> Depends on 7 prior steps

- `api.tasks.[id].initial-commit.POST` → `src\routes\api\tasks\[id]\initial-commit\+server.ts`

### Step 123 · Service: merge

*Requires: Steps 32, 44, 53, 55, 57, 76, 103, 114*
*Parallelizable with: Steps 116, 117, 118, 119, 120, 121, 122, 124, 125, 126*

> Depends on 8 prior steps

- `api.tasks.[id].merge.POST` → `src\routes\api\tasks\[id]\merge\+server.ts`

### Step 124 · Service: push

*Requires: Steps 32, 76, 103, 114*
*Parallelizable with: Steps 116, 117, 118, 119, 120, 121, 122, 123, 125, 126*

> Depends on 4 prior steps

- `api.tasks.[id].push.POST` → `src\routes\api\tasks\[id]\push\+server.ts`

### Step 125 · Service: sync

*Requires: Steps 44, 76, 103, 114*
*Parallelizable with: Steps 116, 117, 118, 119, 120, 121, 122, 123, 124, 126*

> Depends on 4 prior steps

- `api.tasks.[id].sync.POST` → `src\routes\api\tasks\[id]\sync\+server.ts`

### Step 126 · Internal: hooks.server

*Requires: Steps 103, 114*
*Parallelizable with: Steps 116, 117, 118, 119, 120, 121, 122, 123, 124, 125*

> Depends on 2 prior steps

- `resetStaleTasks` → `src\hooks.server.ts`
