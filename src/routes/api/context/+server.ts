import { json } from "@sveltejs/kit";
import { getTask } from "$lib/server/services/tasks";
import { buildContext } from "$lib/server/agent/context";

export async function POST({ request }) {
    const body = await request.json();
    const { taskId, projectRoot } = body;

    if (!taskId?.trim()) {
        return json({ error: "taskId manquant" }, { status: 400 });
    }

    const task = getTask(taskId);
    if (!task) {
        return json({ error: "Task introuvable" }, { status: 404 });
    }

    const root = projectRoot?.trim() || process.cwd();

    try {
        const ctx = buildContext(task, root);
        return json(ctx);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: `Échec de la construction du contexte : ${message}` }, { status: 500 });
    }
}
