# Plan global — Interface Claudicator

## Objectif

Transformer l'UI placeholder en une console d'orchestration 3 panneaux,
avec streaming de logs en temps réel via SSE.

## Bugs bloquants à corriger d'abord

1. `src/lib/services/` doit devenir `src/lib/server/services/` (CLAUDE.md)
2. `src/lib/agent/` doit devenir `src/lib/server/agent/` (CLAUDE.md)
3. `github.ts` : `octokit.issues.get` → `octokit.issues.list` dans `getIssues`
4. `issue.ts` : appel `getIssues(owner, repo)` → `getIssue(owner, repo, issueNumber)`
5. `createIssuePlan` ne doit PAS appeler `commit()` — la validation reste humaine

## Étapes

### Étape 1 — Correction architecture serveur

Déplacer les fichiers vers les bons chemins :

```
src/lib/services/claude.ts  → src/lib/server/services/claude.ts
src/lib/services/github.ts  → src/lib/server/services/github.ts
src/lib/services/git.ts     → src/lib/server/services/git.ts
src/lib/agent/issue.ts      → src/lib/server/agent/issue.ts
```

Mettre à jour les imports dans :
- `src/lib/server/agent/issue.ts`
- `src/routes/api/issue/+server.ts`
- `src/routes/api/issues/+server.ts`

### Étape 2 — Correction des bugs fonctionnels

- `github.ts` : corriger `getIssues` pour utiliser `octokit.issues.list`
- `issue.ts` : passer `issueNumber` à `getIssue`, supprimer `commit()` automatique

### Étape 3 — Système de logs SSE

Créer un émetteur de logs centralisé :
```
src/lib/server/logs.ts
```

Créer le endpoint SSE :
```
src/routes/api/logs/+server.ts
```

Format de log :
```ts
{ ts: string, level: "INFO" | "SUCCESS" | "ERROR", message: string }
```

L'agent émet des logs via `emitLog()` à chaque étape.

### Étape 4 — Store global Svelte

```
src/lib/stores/agent.ts
```

```ts
{
  issue: null | { number, title, state },
  plan: null | string,
  logs: Log[],
  status: "idle" | "loading" | "planning" | "done" | "error"
}
```

### Étape 5 — Composants UI

```
src/lib/components/IssueList.svelte
src/lib/components/AgentConsole.svelte
src/lib/components/ArtifactViewer.svelte
src/lib/components/TopBar.svelte
```

**IssueList** : appelle `GET /api/issues`, affiche la liste, clic → sélection dans le store

**AgentConsole** : se connecte à `GET /api/logs` (SSE), affiche les logs en temps réel,
boutons d'action : Generate Plan, Plan Step, Generate Patch

**ArtifactViewer** : affiche `plan` du store en markdown ou diff selon le contexte

**TopBar** : titre + état de mission courant

### Étape 6 — Layout 3 panneaux

Mettre à jour `src/routes/+layout.svelte` :

```css
grid-template-columns: 280px 1fr 400px;
height: 100vh;
```

Mettre à jour `src/routes/+page.svelte` pour assembler les 4 composants.

## Ordre d'exécution recommandé

1. Etape 1 (architecture) — bloquant tout le reste
2. Etape 2 (bugs) — nécessaire avant de tester
3. Etape 3 (SSE) — infrastructure logs
4. Etape 4 (store) — state management
5. Etape 5 (composants) — UI
6. Etape 6 (layout) — assemblage final

## Ce que Claude ne fait PAS

- Pas de commit automatique
- Pas de push
- Pas de création de branche sans approbation humaine
