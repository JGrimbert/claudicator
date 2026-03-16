# Plan : Reconnexion à un processus Claude en cours

## Problème

Quand la fenêtre se rafraîchit (HMR SvelteKit ou rechargement manuel) :
- `_streamReader` dans `agent.ts` est garbage-collecté → plus de lecture SSE
- `agentRunState` (store Svelte) est réinitialisé → `running: false`, `logs: []`, `sessionAlive: false`

Pourtant, **la session Claude continue à tourner** côté serveur dans `claude-session.ts`.

---

## Localisation des usages

| Fichier | Rôle dans le problème |
|---|---|
| `src/lib/stores/agent.ts` | Gère `_streamReader`, `agentRunState` — tout se perd au refresh |
| `src/lib/server/services/claude-session.ts` | Sessions vivantes, map en mémoire, pas de liste accessible |
| `src/routes/api/agent/run/+server.ts` | Ouvre le SSE, ferme après `turn_end`, sauvegarde les logs |
| `src/routes/api/agent/session/+server.ts` | Route `DELETE` seulement — pas de `GET` pour lire l'état |
| `.agent/tasks/<id>.json` | Contient `status` + `logs[]` — persistant sur disque |
| `src/lib/components/ConsoleDrawer.svelte` | Affiche la console, lit `agentRunState` |

---

## Stratégie

1. Détecter au chargement qu'une task est en cours et que sa session est `alive`
2. Rejouer les logs existants depuis `.agent/tasks/<id>.json`
3. Rouvrir un flux SSE de suivi sans relancer Claude

---

## Étapes

### Step 1 — GET `/api/agent/session`
**Fichier** : `src/routes/api/agent/session/+server.ts`

Ajouter handler `GET` qui retourne `{ alive, busy, taskId }`.

### Step 2 — replayLog dans claude-session.ts
**Fichier** : `src/lib/server/services/claude-session.ts`

- Ajouter `replayLog: TurnEvent[]` (max 200) dans `Session`
- Exposer `getReplayLog(sessionId): TurnEvent[]`

### Step 3 — Route POST `/api/agent/reconnect`
**Nouveau fichier** : `src/routes/api/agent/reconnect/+server.ts`

- Vérifie que la session est alive
- Rejoue logs persistés (type `"replay"`) + events en mémoire
- S'abonne aux nouveaux events via `registerStreamClient`

### Step 4 — Fan-out callbacks dans claude-session.ts
**Fichier** : `src/lib/server/services/claude-session.ts`

- Remplacer `currentCallback: fn | null` par `turnCallback` + `streamClients: Set<fn>`
- Ajouter `registerStreamClient` / `unregisterStreamClient`

### Step 5 — sessionStorage dans agent.ts
**Fichier** : `src/lib/stores/agent.ts`

- `startConsoleStream()` → `sessionStorage.setItem('activeTaskId', taskId)` + `activeTaskTitle`
- `stopConsoleStream()` → `sessionStorage.removeItem('activeTaskId')`

### Step 6 — Détection et reconnexion dans ConsoleDrawer.svelte
**Fichier** : `src/lib/components/ConsoleDrawer.svelte`

- `onMount` → lire `activeTaskId` depuis sessionStorage
- Si session alive → badge "Session en cours" + bouton "Reprendre"
- Clic "Reprendre" → POST `/api/agent/reconnect` → `startConsoleStream(res)`

---

## Vérifications

| Vérification | Méthode |
|---|---|
| Session busy → pas de double turn | `isSessionBusy()` avant tout `sendTurn()`, renvoyer 409 |
| Session détruite entre refresh et reconnexion | GET renvoie `alive: false` → cacher le badge |
| Logs rejoués en doublon | Type `"replay"` distinct dans le SSE |
| Memory leak callbacks | `unregisterStreamClient` dans le `cancel` de la route SSE |
