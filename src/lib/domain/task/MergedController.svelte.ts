/**
 * MergedController — état terminal : la tâche a été mergée.
 * Pas d'upgrade possible depuis ce niveau.
 */

import { TaskController, type TaskDetailCallbacks } from "./TaskController.svelte";
import type { Task } from "$lib/types/task";

export class MergedController extends TaskController {
    constructor(task: Task, cb: TaskDetailCallbacks, prev?: TaskController) {
        super(task, cb);
    }

    // État terminal — upgrade() retourne toujours this
    upgrade(updated: Task): TaskController {
        this.task = updated;
        return this;
    }
}
