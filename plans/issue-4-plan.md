Laissez-moi lire les fichiers modifiés pour comprendre l'état actuel.
Les trois modifications sont déjà appliquées dans les fichiers non-committés :

1. **`agent.ts`** — `pendingSelectTaskId` writable + `notifyTaskCreated(taskId?)` qui stocke l'ID
2. **`ArtifactViewer.svelte`** — récupère `created.id` après le POST et le passe à `notifyTaskCreated`
3. **`TaskList.svelte`** — importe `pendingSelectTaskId`, le consomme dans `onRefreshTick` pour appeler `selectTask`, et dans `selectTask` met à jour le filtre via `statusToFilter`

Le flux complet est déjà en place : création depuis Issues → `notifyTaskCreated(id)` → refresh → `selectTask` trouve la task → filtre basculé sur sa catégorie.

Les changements sont dans le working tree mais pas encore committés. Veux-tu que je les committe ?