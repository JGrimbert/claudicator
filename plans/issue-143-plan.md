Maintenant je vérifie l'état de la route reconnect :
La route reconnect existe — je lis son contenu :
Le plan est **entièrement implémenté**. Tous les fichiers sont en place et cohérents :

| Étape | Fichier | État |
|---|---|---|
| Step 1 | `session/+server.ts` | `GET` handler présent → `{ alive, busy, taskId }` |
| Step 2+4 | `claude-session.ts` | `turnCallback` + `streamClients` + `replayLog` + `broadcast` + toutes les exports |
| Step 3 | `reconnect/+server.ts` | Route SSE complète — replay disque + replay mémoire + fan-out |
| Step 5 | `stores/agent.ts` | `sessionStorage` persisté + type `"replay"` dans `RunLog` |
| Step 6 | `ConsoleDrawer.svelte` | `checkReconnect()` au mount + badge vert + bouton Reprendre |

Les fichiers sont modifiés/créés (visibles dans `git status`) mais pas encore commités. L'implémentation est fonctionnelle — rien ne manque par rapport au plan.