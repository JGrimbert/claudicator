/** Agent — lit ou détruit la session Claude active (GET / DELETE) */
import { destroySession, isSessionAlive, isSessionBusy } from "$lib/server/services/claude-session";
import { isRunning } from "$lib/server/services/processes";
import { getTask, updateTask } from "$lib/server/services/tasks";

/** Retourne l'état d'une session : { alive, busy, taskId } */
export async function GET({ url }) {
    const taskId = url.searchParams.get("taskId");
    if (!taskId) {
        return new Response(JSON.stringify({ error: "taskId manquant" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }
    const sessionAlive = isSessionAlive(taskId);
    const oneShotRunning = isRunning(taskId);
    return new Response(JSON.stringify({
        alive: sessionAlive || oneShotRunning,
        busy: isSessionBusy(taskId) || oneShotRunning,
        taskId,
    }), { headers: { "Content-Type": "application/json" } });
}

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
