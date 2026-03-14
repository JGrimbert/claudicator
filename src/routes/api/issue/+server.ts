/** GitHub — lit une issue avec ses sous-issues (GET) */
import { json } from "@sveltejs/kit";
import { getCurrentProject } from "$lib/server/services/projects";
import { createIssuePlan } from "$lib/server/agent/issue";
import { getIssue, getSubIssues } from "$lib/server/services/github";



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
            state: s.state
        }))
    });
}

/** Génère un plan pour une issue donnée */
export async function POST({ request }) {
    const { issue } = await request.json();
    const result = await createIssuePlan(issue);
    return json(result);
}