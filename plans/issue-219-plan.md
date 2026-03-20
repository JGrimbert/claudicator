Maintenant je dois trouver le composant parent qui contient les onglets du panel bas (PLAN / CONSOLE).
Maintenant je vérifie le store `consoleTab` dans `agent.ts`.
J'ai tout ce qu'il faut. Voici les 3 modifications à faire :

1. `RunConsole.svelte` — rétablir l'input
2. `AgentInput.svelte` — recharger le plan + basculer l'onglet CONSOLE
Maintenant `AgentInput.svelte` — importer `consoleTab`, ajouter `reloadPlan`, le `$effect`, et basculer l'onglet au lancement :
Ajouter `reloadPlan` et son `$effect` après `loadContext` :
Maintenant basculer l'onglet CONSOLE au démarrage du lancement :
Les 3 fixes sont appliqués :

- **Input console** — `showInput={!$agentRunState.running}` : l'input est visible quand Claude ne tourne pas, caché pendant l'exécution.
- **Rechargement plan** — `reloadPlan` + `$effect` sur `taskRefreshTick` : quand un run se termine sur la task courante, le plan est rechargé automatiquement sans toucher `loadedId`.
- **Bascule onglet CONSOLE** — `consoleTab.set("console")` au démarrage du lancement depuis AgentInput : l'onglet CONSOLE passe au premier plan dans le panel bas.