Je lance les 4 étapes en parallèle sur les fichiers indépendants, puis l'étape 4 après.

**Étape 1 — `agent.ts` : ajouter `onEvent` à `startConsoleStream`**
**Étape 2 — `stack-plan-full/+server.ts` : remplacer par SSE streaming**
**Étape 3 — `IssueGroups.svelte` : utiliser `agentRunState` + `startConsoleStream`**
**Étape 4 — `AgentConsole.svelte` : onglets "groupes" et "console" persistants**
Les 4 étapes sont appliquées. Voici ce qui a changé :

**`agent.ts`** — `startConsoleStream()` accepte maintenant un callback `onEvent` optionnel, appelé pour chaque event SSE parsé.

**`stack-plan-full/+server.ts`** — Plus de `callClaude()` bloquant. Le handler retourne un `ReadableStream` SSE : chaque ligne stdout de Claude est émise en temps réel, et à la fermeture du process un event `{"line":"[done]","type":"system","planFile":"..."}` est émis avec le fichier sauvegardé.

**`IssueGroups.svelte`** — `planFullStack()` initialise maintenant `agentRunState` (running=true, logs vides, titre) avant le fetch, puis passe la Response à `startConsoleStream()` qui bascule automatiquement vers l'onglet "console". Le callback `onEvent` capture l'event `[done]` pour mettre à jour `fullStackState`.

**`AgentConsole.svelte`** — Les onglets "groupes" et "console" sont sortis du `{#if}` conditionnel. Ils sont maintenant toujours montés, visibles ou cachés via `style:display`. `IssueGroups` garde ses données (groups, haikus, stackState…) quand on bascule vers la console et qu'on revient.