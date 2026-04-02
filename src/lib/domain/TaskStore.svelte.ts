/**
 * Store réactif partagé pour la liste des tasks.
 * Utilise les runes Svelte 5 en module (.svelte.ts).
 * Seules les données sont ici — les fonctions loadTasks/loadTasksSilent
 * restent dans TaskList.svelte pour maintenir les tests existants.
 */
import type { Task } from "$lib/types/task";

export const taskStore = $state({
    tasks: [] as Task[],
    loading: true,
});
