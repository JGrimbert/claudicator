import { json } from "@sveltejs/kit";
import { closeIssue } from "$lib/server/services/github";
import { getCurrentProject } from "$lib/server/services/projects";

export async function POST({ params }) {
    const issueNumber = Number(params.number);
    if (!issueNumber) return json({ error: "Numéro d'issue invalide" }, { status: 400 });

    const project = getCurrentProject();
    const owner = project?.owner;
    const repo  = project?.repo;
    if (!owner || !repo) return json({ error: "Projet sans owner/repo configuré" }, { status: 400 });

    try {
        await closeIssue(owner, repo, issueNumber);
        return json({ ok: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, { status: 500 });
    }
}
