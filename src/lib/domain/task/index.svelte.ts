/**
 * Point d'entrée public du domaine task.
 * Exporte les classes et la factory createController().
 */

export { TaskController, type TaskDetailCallbacks } from "./TaskController.svelte";
export { SpecController } from "./SpecController.svelte";
export { PlanController } from "./PlanController.svelte";
export { ImplController } from "./ImplController.svelte";
export { MergedController } from "./MergedController.svelte";
export { FullPlanController } from "./FullPlanController.svelte";

import { TaskController, type TaskDetailCallbacks } from "./TaskController.svelte";
import { SpecController } from "./SpecController.svelte";
import { PlanController } from "./PlanController.svelte";
import { ImplController } from "./ImplController.svelte";
import { MergedController } from "./MergedController.svelte";
import { FullPlanController } from "./FullPlanController.svelte";
import type { Task } from "$lib/types/task";

/**
 * Factory : crée le contrôleur adapté à l'état courant de la task.
 * Point d'entrée unique — utiliser dans TaskDetail.svelte.
 */
export function createController(task: Task, cb: TaskDetailCallbacks): TaskController {
    if (task.status === "merged") return new MergedController(task, cb);
    if (task.type === "fullplan") return new FullPlanController(task, cb);
    if (task.branch) return new ImplController(task, cb);
    if (task.hasPlan) return new PlanController(task, cb);
    return new SpecController(task, cb);
}
