Laisse-moi lire les fichiers clés pour comprendre l'état actuel précis.
Maintenant je lis TaskList pour comprendre le flux actuel de sélection.
Maintenant je lis ProjetPanel pour comprendre le rendu conditionnel de TaskList.
Laisse-moi vérifier les valeurs de `consoleTab` dans le projet.
J'ai maintenant une compréhension complète. Voici le diagnostic :

**Cause du bug** : `TaskList` est rendu conditionnellement (`{#if currentTabId === "tasks"}`). Quand `notifyTaskCreated` est appelé depuis l'onglet issues :
1. `projetPanelTab = "tasks"` → `TaskList` **monte pour la première fois**
2. À l'init, `$: if ($taskRefreshTick) onRefreshTick()` ET `onMount` démarrent **en parallèle**
3. `onMount` sélectionne la tâche sauvée en localStorage, écrasant la sélection de `onRefreshTick`

**Plan** :
1. Dans `TaskList.onMount` : lire `pendingSelectTaskId` **synchronement avant tout await** — si présent, laisser `onRefreshTick` gérer
2. Dans `ArtifactViewer.createTask` : état `taskCreating`, attendre que `planModeTask` corresponde à la task créée avant de relâcher l'UI

Lecture des lignes exactes avant modification :
Maintenant j'applique les deux changements :
Maintenant le changement dans `ArtifactViewer.svelte` :
Maintenant mettre à jour le bouton dans le template :
Vérifions que les changements sont cohérents :
C'est bon. Résumé des changements :

---

**`TaskList.svelte`** — fix du bug de race condition :
- Import de `get` depuis `svelte/store`
- Dans `onMount` : lecture synchrone de `pendingSelectTaskId` **avant tout `await`** — si présent, on laisse `onRefreshTick` gérer et on retourne immédiatement. Ça évite que `onMount` sélectionne la mauvaise tâche et écrase la sélection correcte.

**`ArtifactViewer.svelte`** — coordination UI (point X) :
- `waitForTaskActive(taskId)` : souscrit à `planModeTask`, résout quand l'id correspond (timeout fallback 5s)
- `createTask()` : état `taskCreating` actif pendant toute la durée — fetch → `notifyTaskCreated` → **attend** que `planModeTask` passe à la nouvelle task → seulement alors libère l'UI avec `taskCreated = true`
- Bouton : `disabled` pendant `taskCreating || taskCreated`, label `…` pendant la création

**Point 3 (colonne droite)** : La colonne droite (`PlanPanel`) a `"clusters"` comme onglet par défaut — rien à changer. Si plus tard tu veux la forcer depuis l'extérieur, il suffit d'exporter un store `planPanelTab` dans `agent.ts` et de l'utiliser dans `PlanPanel`.