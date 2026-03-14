import { json } from "@sveltejs/kit";
import { listTasks, createTask } from "$lib/server/services/tasks";

/** Retourne la liste de toutes les tâches */
export async function GET() {
    return json(listTasks());
}

/** Crée une tâche ou retourne l'existante */
export async function POST({ request }) {
    const body = await request.json();
    if (!body.title?.trim()) {
        return json({ error: "Titre manquant" }, { status: 400 });
    }
    const existing = body.issueNumber !== undefined
        ? listTasks().find(t => t.issueNumber === body.issueNumber)
        : undefined;
    if (existing) return json({ ...existing, alreadyExisted: true }, { status: 200 });

    const task = createTask({
        title: body.title.trim(),
        issueNumber: body.issueNumber,
        branch: body.branch,
    });
    return json(task, { status: 201 });
}
