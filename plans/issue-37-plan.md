Je vais lire les fichiers concernés pour appliquer les modifications.
Les trois modifications sont déjà en place dans les fichiers :

- `agent.ts:102` — `issueListRefreshTick = writable(0)` ✓
- `ArtifactViewer.svelte:256` — `issueListRefreshTick.update(n => n + 1)` après création réussie ✓
- `IssueList.svelte:86` — `$: if ($issueListRefreshTick > 0) { loadIssues(); }` ✓

Rien à modifier, le code est déjà dans l'état attendu.