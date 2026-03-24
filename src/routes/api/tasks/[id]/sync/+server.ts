/** Tâches — synchronise l'état push/merge de la tâche (POST) */
import { json } from "@sveltejs/kit";
import { resolveTaskContext, updateTask } from "$lib/server/services/tasks";
import { getBranchState } from "$lib/server/services/git";

/** Synchronise l'état push/merge d'une tâche */
export async function POST({ params }) {
    const ctx = resolveTaskContext(params.id);
    if (!ctx) return json({ error: "Task introuvable" }, { status: 404 });
    const { task, projectRoot: root } = ctx;
    if (!task.branch) return json(task);

    try {
        const { pushed, merged } = await getBranchState(root, task.branch);

        const patch: Parameters<typeof updateTask>[1] = {};
        if (pushed && !task.pushed) patch.pushed = true;
        if (merged && task.status !== "merged") patch.status = "merged";

        if (Object.keys(patch).length > 0) {
            return json(updateTask(params.id, patch));
        }
        return json(task);
    } catch {
        return json(task);
    }
}
