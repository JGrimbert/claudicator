import { json } from "@sveltejs/kit";
import { listTasks, createTask } from "$lib/server/services/tasks";

export async function GET() {
    return json(listTasks());
}

export async function POST({ request }) {
    const body = await request.json();
    if (!body.title?.trim()) {
        return json({ error: "Titre manquant" }, { status: 400 });
    }
    const task = createTask({
        title: body.title.trim(),
        issueNumber: body.issueNumber,
        branch: body.branch,
    });
    return json(task, { status: 201 });
}
