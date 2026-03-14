# Plan : Architecture console "session long-lived"

## Contexte

Actuellement, chaque invocation de Claude utilise le flag `-p` (print / non-interactif) :

- Le process spawne, reçoit un prompt via stdin, répond, puis **se termine**
- Impossible de poursuivre la conversation sans relancer un nouveau process
- Pas d'historique de session, pas de suivi de contexte entre les tours

L'objectif est de passer à une architecture "process long vivant" pour la phase
d'implémentation, où Claude reste actif et reçoit des messages successifs via stdin.

---

## Architecture cible

```
Phase plan        →  spawn avec -p (inchangé, one-shot)
Phase impl        →  session long-lived (nouveau)
                         │
                         ├─ createSession(taskId, cwd, addDir)
                         │    spawn("claude", ["--dangerously-skip-permissions",
                         │                     "--output-format", "stream-json",
                         │                     "--add-dir", root])
                         │    stdin reste OUVERT
                         │
                         ├─ sendTurn(taskId, message, onEvent)
                         │    → stdin.write(message + "\n")
                         │    → stream JSON jusqu'au "result" event → SSE fermé
                         │    → process reste vivant
                         │
                         └─ destroySession(taskId)
                              → taskkill /F /T /PID (Windows)
```

---

## Étapes d'implémentation

### Étape 1 — Service `claude-session.ts`

**Fichier à créer** : `src/lib/server/services/claude-session.ts`

Responsabilités :
- Spawn d'un process Claude **sans `-p`** (mode interactif)
- Gestion du cycle de vie : `idle` → `busy` → `idle` → `destroyed`
- Parsing du stream JSON stdout (identique à l'existant)
- Détection de fin de tour via l'event `result`
- Émission d'événements structurés vers le callback appelant

Interface publique :

```typescript
type TurnEventType = "agent_text" | "tool_use" | "usage" | "turn_end" | "error";

interface TurnEvent {
  type: TurnEventType;
  payload: unknown;
}

// Crée et démarre la session (le process reste en attente de stdin)
function createSession(sessionId: string, cwd: string, addDir: string): void

// Envoie un message, streame les événements jusqu'à turn_end
// Rejette si la session est déjà busy (throw ou callback error)
function sendTurn(
  sessionId: string,
  message: string,
  onEvent: (e: TurnEvent) => void
): void

// Tue le process et supprime la session
function destroySession(sessionId: string): void

// Vrai si la session existe et n'est pas détruite
function isSessionAlive(sessionId: string): boolean

// Vrai si la session est en train de traiter un tour
function isSessionBusy(sessionId: string): boolean
```

Comportement interne :

- **stdin** : ne jamais appeler `proc.stdin.end()` → le process reste en attente
- **stdout** : parsing JSON ligne par ligne (même logique que `run/+server.ts`)
- **Fin de tour** : event `{"type": "result"}` → émettre `turn_end` + passer `busy → idle`
- **Erreur process** : émettre `error` + marquer session comme détruite
- **Fermeture inattendue** : si le process se ferme sans `result`, émettre `error`

---

### Étape 2 — Modifier `run/+server.ts`

**Phase plan** : inchangée (garde `-p` + `proc.stdin.end()`).

**Phase implémentation** (quand `plan?.trim() && taskId`) :

Remplacer le spawn one-shot par :

1. Si `!isSessionAlive(taskId)` → appeler `createSession(taskId, root, root)`
2. Si `isSessionBusy(taskId)` → retourner 409
3. Appeler `sendTurn(taskId, prompt, onEvent)` où `onEvent` alimente le SSE
4. À `turn_end` → mettre à jour la task, fermer le SSE, **ne pas tuer le process**
5. Supprimer l'enregistrement dans `processes.ts` (géré désormais par `claude-session.ts`)

---

### Étape 3 — Nouveau endpoint `DELETE /api/agent/session`

**Fichier à créer** : `src/routes/api/agent/session/+server.ts`

```
DELETE /api/agent/session   { taskId }
  → destroySession(taskId)
  → updateTask(taskId, { status: "failed" })   // si encore en cours
  → 200 OK
```

Utilisé pour le nettoyage explicite (abandon de task, fin de workflow).

---

### Étape 4 — Modifier `RunConsole.svelte`

Ajouts UI :

1. **Badge "session active"** — visible quand `isSessionAlive(taskId)` (polling léger
   ou état retourné par le SSE)
2. **Bouton "Continuer"** — permet d'envoyer un nouveau message à la session existante
   sans reconstruire le prompt enrichi (appel direct `POST /api/agent/run` avec juste
   un `message` libre, pas de `plan`)
3. **Bouton "Terminer la session"** — appelle `DELETE /api/agent/session`

La barre stdin existante (réponse interactive) peut être réutilisée telle quelle pour
les messages de suivi.

---

### Étape 5 — Nettoyage automatique

- **Fin de workflow** (status → `documentation` ou `failed`) → appeler `destroySession`
- **Redémarrage serveur** (`hooks.server.ts`) → `destroySession` pour toutes les sessions
  orphelines (le process n'existe plus de toute façon, juste vider la map)

---

## Points d'attention

| # | Sujet | Solution |
|---|---|---|
| 1 | **stdin ouvert** | Ne pas appeler `proc.stdin.end()` en mode session |
| 2 | **Fin de tour** | Event `{"type":"result"}` → fermer SSE, garder process |
| 3 | **Concurrence** | Rejeter avec 409 si session `busy` |
| 4 | **Rétrocompat** | Phase plan garde `-p` intacte |
| 5 | **Windows** | `claude.cmd` + `taskkill /F /T /PID` inchangés |
| 6 | **Prompt interactif** | Claude en mode interactif peut émettre du texte de prompt (ex: `>`) — à filtrer dans le parsing stderr |

---

## Fichiers modifiés / créés

| Fichier | Action |
|---|---|
| `src/lib/server/services/claude-session.ts` | **Créer** |
| `src/routes/api/agent/run/+server.ts` | **Modifier** (impl phase seulement) |
| `src/routes/api/agent/session/+server.ts` | **Créer** |
| `src/lib/components/RunConsole.svelte` | **Modifier** (UI session) |
| `src/hooks.server.ts` | **Modifier** (nettoyage au démarrage) |

---

## Ce qui ne change pas

- Phase plan : spawn `-p`, stdin.end(), SSE jusqu'à close — **identique**
- `processes.ts` : conservé pour la phase plan
- Format SSE côté client : inchangé (`{ line, type }`)
- Parsing JSON stdout : réutilisé à l'identique dans `claude-session.ts`
