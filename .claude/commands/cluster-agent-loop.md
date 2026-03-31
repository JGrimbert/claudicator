# Skill : Cluster agent-loop

Protocole de navigation et d'expérience accumulée sur le cluster exécution Claude / SSE.

## Périmètre (71+51+44+39+26+8+8 touches git)

| Fichier | Responsabilité |
|---|---|
| `src/lib/stores/agent.ts` | Store Svelte — `agentRunState`, `contextState`, lecteur SSE module-level |
| `src/routes/api/agent/run/+server.ts` | Spawn claude, stream SSE, sauvegarde plan/patch |
| `src/lib/components/AgentInput.svelte` | Zone de saisie du prompt, déclenchement du run |
| `src/lib/components/AgentConsole.svelte` | Affichage des logs temps réel, spinner braille |
| `src/lib/components/RunConsole.svelte` | Console run (variante drawer/inline) |
| `src/lib/components/ConsoleDrawer.svelte` | Drawer qui encapsule la console |
| `src/lib/server/services/processes.ts` | Map `taskId → ChildProcess` (kill, stdin, isRunning) |
| `src/lib/server/services/claude-session.ts` | Gestion session Claude (résumé, reprise) |
| `src/routes/api/agent/session/+server.ts` | API session (statut, interruption) |
| `src/routes/api/agent/preview-prompt/+server.ts` | Prévisualisation du prompt avant envoi |

## Architecture

### Flux d'exécution
```
AgentInput (prompt) → POST /api/agent/run
  → spawn claude (stdin prompt, --dangerously-skip-permissions)
  → SSE stream → consumeStream() dans agent.ts
  → agentRunState.logs[] mis à jour en temps réel
  → AgentConsole / RunConsole affiche les logs
```

### Store `agentRunState`
```ts
{ taskId, taskTitle, logs: RunLog[], running, sessionAlive,
  consoleMinimized, completionLabel, liveUsage, sessionUsage }
```
`RunLog.type` : `"agent" | "system" | "usage" | "context" | "session_status" | "replay"`

### Store `contextState`
```ts
{ source: { kind: "task" | "issue" | "todo", label }, items: ContextItem[], loading, error }
```

### Spawn claude
- Pas de `ANTHROPIC_API_KEY` ni `CLAUDECODE` dans l'env
- Flags : `-p --dangerously-skip-permissions`
- Prompt via stdin
- `cwd` = root du projet cible
- `--add-dir root`

### SSE stream reader
`_streamReader` est module-level dans `agent.ts` — survive aux démontages de composants.
Permet d'interrompre le stream sans perdre la connexion.

## Protocole d'entrée

1. Lire `src/lib/stores/agent.ts` entier (types + stores + `consumeStream`)
2. Lire `src/routes/api/agent/run/+server.ts` entier
3. Si modif UI console → lire le composant concerné ciblé

## Expérience accumulée

### Pitfalls connus
_(vide — se remplit après les issues)_

### Patterns validés
_(vide)_

### Leçons d'issues passées

| Issue | Date | Leçon |
|---|---|---|
