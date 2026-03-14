/** Agent — détruit la session Claude active (DELETE) */
import { destroySession } from "$lib/server/services/claude-session";
import { getTask, updateTask } from "$lib/server/services/tasks";

/** Supprime une session de tâche en cours */
export async function DELETE({ request }) {
    const { taskId } = await request.json();
    if (!taskId) {
        return new Response(JSON.stringify({ error: "taskId manquant" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    destroySession(taskId);

    // Si la task est encore en cours, la marquer comme failed
    const task = getTask(taskId);
    if (task && (task.status === "planification")) {
        updateTask(taskId, { status: "failed" });
    }

    return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
    });
}
