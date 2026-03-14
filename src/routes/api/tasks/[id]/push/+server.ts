/** Tâches — pousse la branche de la tâche vers le remote (POST) */
import { json } from "@sveltejs/kit";
import { getTask, updateTask } from "$lib/server/services/tasks";
import { pushBranch } from "$lib/server/services/git";
import { getProjectRoot } from "$lib/server/services/projects";

/** Pousse la branche d'une tâche vers le remote */
export async function POST({ params }) {
    const task = getTask(params.id);
    if (!task) return json({ error: "Task introuvable" }, { status: 404 });
    if (!task.branch) return json({ error: "Pas de branche associée" }, { status: 400 });

    const root = getProjectRoot();
    try {
        await pushBranch(root, task.branch);
        return json(updateTask(params.id, { pushed: true }));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, { status: 500 });
    }
}
