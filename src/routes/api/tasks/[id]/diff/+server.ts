/** Tâches — retourne le git diff de la tâche (GET) */
import { json } from "@sveltejs/kit";
import { getTask } from "$lib/server/services/tasks";
import { getDiff } from "$lib/server/services/git";
import { getProjectRoot } from "$lib/server/services/projects";

/** Retourne le diff git d'une tâche */
export async function GET({ params }) {
    const task = getTask(params.id);
    if (!task) return json({ error: "Task introuvable" }, { status: 404 });
    if (!task.branch) return json({ diff: "" });

    const root = getProjectRoot();
    try {
        const diff = await getDiff(root);
        return json({ diff });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, { status: 500 });
    }
}
