Le code `RunConsole.svelte` est correct. Le problème est probablement que `sessionAlive` n'est jamais passé à `true`. Vérifions le store et le stream.
Le problème est clair : le footer input est `disabled` quand `!$agentRunState.running && !$agentRunState.sessionAlive`. `sessionAlive` doit être mis à `true` via un event SSE `session_status`. Vérifions le serveur.
Le diagnostic est clair : `sessionAlive` reste `false` parce que l'event SSE `session_status: "true"` peut être perdu si le chunk final est fragmenté, ou si le stream se ferme avant que le client ne lise le dernier paquet.

**Fix minimal** : après que le stream se termine pour un run d'implémentation, si `sessionAlive` est encore `false`, on vérifie directement sur le serveur via `GET /api/agent/session`.
Vérifions le résultat :
Appliquer le même fallback dans `ConsoleDrawer.continuer()` pour les follow-ups :
Et le même fallback dans `sendFollowUp` de `RunConsole.svelte` :
**Résumé du problème et du fix :**

**Cause racine** : `sessionAlive` est mis à `true` uniquement via un event SSE `session_status` envoyé par le serveur à la fin du turn. Si ce dernier paquet SSE est fragmenté au niveau TCP (chunk boundary), `JSON.parse` échoue silencieusement sur la ligne tronquée → l'event est perdu → `sessionAlive` reste `false` → le footer input reste `disabled`.

**Fix appliqué dans 3 fichiers** :
- `AgentInput.svelte` — après le stream impl
- `ConsoleDrawer.svelte` — après chaque follow-up via `continuer()`
- `RunConsole.svelte` — après chaque follow-up via `sendFollowUp()`

Dans chaque cas, si `sessionAlive` est encore `false` après que le stream se termine, on fait un `GET /api/agent/session?taskId=...` qui interroge directement le serveur. Si la session est vivante, on met à jour le store. C'est un fallback non-destructif qui ne change rien si l'event SSE arrive correctement.