/** Tâches — lit, met à jour ou supprime une tâche (GET, PATCH, DELETE) */
import { json } from "@sveltejs/kit";
import { getTask, updateTask, deleteTask } from "$lib/server/services/tasks";
import { scanGodObjects } from "$lib/server/services/god-objects";
import { getProjectRoot } from "$lib/server/services/projects";

/** Récupère une tâche par ID */
export async function GET({ params }) {
    const task = getTask(params.id);
    if (!task) return json({ error: "Task introuvable" }, { status: 404 });
    return json(task);
}

/** Met à jour une tâche par ID */
export async function PATCH({ params, request }) {
    const body = await request.json();
    const task = updateTask(params.id, body);
    if (!task) return json({ error: "Task introuvable" }, { status: 404 });
    return json(task);
}

/** Supprime une tâche par ID */
export async function DELETE({ params }) {
    const task = getTask(params.id);
    if (!task) return json({ error: "Task introuvable" }, { status: 404 });

    const ok = deleteTask(params.id);

    // Re-scan automatique après suppression d'une tâche de refactoring
    if (task.title.startsWith("Refactoring:")) {
        setImmediate(() => {
            try { scanGodObjects(getProjectRoot()); } catch { /* silencieux */ }
        });
    }

    return json({ ok });
}
