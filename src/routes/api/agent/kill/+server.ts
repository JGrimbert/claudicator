import { json } from "@sveltejs/kit";
import { killProcess, isRunning } from "$lib/server/services/processes";
import { updateTask } from "$lib/server/services/tasks";

export async function POST({ request }) {
    const { taskId } = await request.json();
    if (!taskId) return json({ error: "taskId manquant" }, { status: 400 });

    const wasRunning = isRunning(taskId);
    killProcess(taskId);
    if (wasRunning) updateTask(taskId, { status: "failed" });

    return json({ ok: true });
}
