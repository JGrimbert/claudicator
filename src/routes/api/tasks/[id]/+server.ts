import { json } from "@sveltejs/kit";
import { getTask, updateTask, deleteTask } from "$lib/server/services/tasks";

export async function GET({ params }) {
    const task = getTask(params.id);
    if (!task) return json({ error: "Task introuvable" }, { status: 404 });
    return json(task);
}

export async function PATCH({ params, request }) {
    const body = await request.json();
    const task = updateTask(params.id, body);
    if (!task) return json({ error: "Task introuvable" }, { status: 404 });
    return json(task);
}

export async function DELETE({ params }) {
    const ok = deleteTask(params.id);
    if (!ok) return json({ error: "Task introuvable" }, { status: 404 });
    return json({ ok: true });
}
