/** Tâches — pousse la branche de la tâche vers le remote (POST) */
import { json } from "@sveltejs/kit";
import { resolveTaskContext, updateTask } from "$lib/server/services/tasks";
import { pushBranch } from "$lib/server/services/git";

/** Pousse la branche d'une tâche vers le remote */
export async function POST({ params }) {
    const ctx = resolveTaskContext(params.id);
    if (!ctx) return json({ error: "Task introuvable" }, { status: 404 });
    const { task, projectRoot: root } = ctx;
    if (!task.branch) return json({ error: "Pas de branche associée" }, { status: 400 });
    try {
        await pushBranch(root, task.branch);
        return json(updateTask(params.id, { pushed: true }));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, { status: 500 });
    }
}
