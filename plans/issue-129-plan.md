La solution : ajouter un store `projetPanelTab` dans `agent.ts`, le connecter à `ProjetPanel.svelte`, et l'activer sur "tasks" dans `notifyTaskCreated`.
Fait. Voici ce qui a changé :

**`agent.ts`** — nouveau store `projetPanelTab` + `notifyTaskCreated` bascule sur `"tasks"` quand un `taskId` est fourni :
```ts
export const projetPanelTab = writable<"todos" | "issues" | "tasks">("issues");
export function notifyTaskCreated(taskId?: string) {
    if (taskId) {
        pendingSelectTaskId.set(taskId);
        projetPanelTab.set("tasks"); // ← switch automatique
    }
    taskRefreshTick.update(n => n + 1);
}
```

**`ProjetPanel.svelte`** — `activeTab` local remplacé par `$projetPanelTab` (store réactif). Les boutons onglets appellent `projetPanelTab.set(...)`.

Résultat : quand on clique "Task →" dans `ArtifactViewer`, `notifyTaskCreated(id)` est appelé → le panneau bascule sur TASKS + la nouvelle task est sélectionnée via `pendingSelectTaskId`.