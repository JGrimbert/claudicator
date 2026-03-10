Maintenant je vois le code. Laissez-moi lire la suite de `TaskList.svelte` pour voir la fonction `selectTask` :
J'ai tout ce qu'il faut. Voici les modifications à faire :

1. **`agent.ts`** : ajouter un store `tasksReady`
2. **`TaskList.svelte`** : priorité task `running` au `onMount` + signaler `tasksReady`
3. **`+page.svelte`** : ne montrer `IssueAnalysis` que si `tasksReady && !planModeTask`
Maintenant je fais les 3 modifications :
Les 3 modifications sont faites :

1. **`agent.ts`** : nouveau store `tasksReady` (démarre à `false`)

2. **`TaskList.svelte` > `onMount`** : cherche d'abord une task `running`, puis celle en localStorage, puis la première avec un plan. Après sélection, passe `tasksReady` à `true`.

3. **`+page.svelte`** : la RoadMap ne s'affiche que si `$tasksReady && !$planModeTask`, c'est-à-dire une fois les tasks chargées ET seulement si aucune task n'est active.

**Comportement au démarrage :**
- Si une task en cours est trouvée → elle est sélectionnée → `planModeTask` non null → la RoadMap ne s'affiche pas, l'écran du workflow de la task s'affiche
- Si aucune task en cours → `planModeTask` reste null → la RoadMap s'affiche normalement (comme avant)
- Pas de flash : la RoadMap est bloquée jusqu'à ce que `tasksReady` soit true, donc le temps que TaskList finisse de chercher la task active