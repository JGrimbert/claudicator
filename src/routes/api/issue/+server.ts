/** GitHub — lit une issue avec ses sous-issues (GET) */
import { json } from "@sveltejs/kit";
import { getCurrentProject } from "$lib/server/services/projects";
import { createIssuePlan } from "$lib/server/agent/issue";
import { getIssue, getSubIssues, updateIssue } from "$lib/server/services/github";



/** Récupère une issue GitHub avec ses sous-issues */
export async function GET({ url }) {
    const number = Number(url.searchParams.get("number"));

    if (!number) {
        return json({ error: "Paramètre 'number' manquant" }, { status: 400 });
    }

    const owner = getCurrentProject()?.owner ?? "";
    const repo = getCurrentProject()?.repo ?? "";

    const [issue, subIssues] = await Promise.all([
        getIssue(owner, repo, number),
        getSubIssues(owner, repo, number)
    ]);

    return json({
        number: issue.number,
        title: issue.title,
        body: issue.body ?? "",
        state: issue.state,
        created: issue.created_at,
        subIssues: subIssues.map(s => ({
            number: s.number,
            title: s.title,
            body: s.body ?? "",
            state: s.state
        }))
    });
}

/** Met à jour titre et/ou corps d'une issue */
export async function PATCH({ request }) {
    const { number, title, body } = await request.json();
    if (!number) return json({ error: "number manquant" }, { status: 400 });

    const owner = getCurrentProject()?.owner ?? "";
    const repo  = getCurrentProject()?.repo  ?? "";

    const issue = await updateIssue(owner, repo, number, {
        ...(title !== undefined ? { title } : {}),
        ...(body  !== undefined ? { body  } : {}),
    });
    return json({ number: issue.number, title: issue.title, body: issue.body ?? "" });
}

/** Génère un plan pour une issue donnée */
export async function POST({ request }) {
    const { issue } = await request.json();
    const result = await createIssuePlan(issue);
    return json(result);
}