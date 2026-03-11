import { listTasks, updateTask } from "$lib/server/services/tasks";

/** Au démarrage du serveur, toute task "planification" est orpheline → failed. */
function resetStaleTasks() {
    for (const task of listTasks()) {
        if (task.status === "planification") {
            updateTask(task.id, { status: "failed" });
        }
    }
}

resetStaleTasks();
