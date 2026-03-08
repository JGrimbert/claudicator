import { json } from "@sveltejs/kit";
import { getTask } from "$lib/server/services/tasks";
import { revertAll } from "$lib/server/services/git";
import { getProjectRoot } from "$lib/server/services/projects";

export async function POST({ params }) {
    const task = getTask(params.id);
    if (!task) return json({ error: "Task introuvable" }, { status: 404 });
    if (!task.branch) return json({ error: "Pas de branche associée" }, { status: 400 });

    const root = getProjectRoot();
    try {
        await revertAll(root);
        return json({ ok: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, { status: 500 });
    }
}
