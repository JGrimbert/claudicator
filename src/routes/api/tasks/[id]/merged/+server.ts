/** Tâches — supprime une tâche dont la branche a été mergée (POST) */
import { json } from "@sveltejs/kit";
import { getTask, deleteTask } from "$lib/server/services/tasks";

/** Supprime la tâche associée après que sa branche a été mergée */
export async function POST({ params }) {
    const task = getTask(params.id);
    if (!task) return json({ error: "Task introuvable" }, { status: 404 });

    const deleted = deleteTask(params.id);
    return json({ ok: deleted });
}
