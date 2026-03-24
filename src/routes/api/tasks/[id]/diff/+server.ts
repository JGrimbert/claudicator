/** Tâches — retourne le git diff de la tâche (GET) */
import { json } from "@sveltejs/kit";
import { resolveTaskContext } from "$lib/server/services/tasks";
import { getDiff } from "$lib/server/services/git";

/** Retourne le diff git d'une tâche */
export async function GET({ params }) {
    const ctx = resolveTaskContext(params.id);
    if (!ctx) return json({ error: "Task introuvable" }, { status: 404 });
    const { task, projectRoot: root } = ctx;
    if (!task.branch) return json({ diff: "" });
    try {
        const diff = await getDiff(root);
        return json({ diff });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, { status: 500 });
    }
}
