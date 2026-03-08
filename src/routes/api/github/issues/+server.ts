import { json } from "@sveltejs/kit";
import { getCurrentProject } from "$lib/server/services/projects";
import { createIssue } from "$lib/server/services/github";



export async function POST({ request }) {
    const { title, body } = await request.json();
    if (!title?.trim()) return json({ error: "Titre manquant" }, { status: 400 });

    const owner = getCurrentProject()?.owner ?? "";
    const repo  = getCurrentProject()?.repo ?? "";

    const issue = await createIssue(owner, repo, title.trim(), body ?? "");
    return json({ number: issue.number, title: issue.title }, { status: 201 });
}
