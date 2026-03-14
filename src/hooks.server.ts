import { listTasks, updateTask } from "$lib/server/services/tasks";
import { destroyAllSessions } from "$lib/server/services/claude-session";

/** Au démarrage du serveur, toute task "planification" est orpheline → failed. */
function resetStaleTasks() {
    for (const task of listTasks()) {
        if (task.status === "planification") {
            updateTask(task.id, { status: "failed" });
        }
    }
}

// Sessions orphelines du processus précédent (n'existent plus, on vide juste la map)
destroyAllSessions();
resetStaleTasks();
