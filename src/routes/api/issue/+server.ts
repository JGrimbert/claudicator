import { json } from "@sveltejs/kit";
import { createIssuePlan } from "$lib/server/agent/issue";
import { getIssue, getSubIssues } from "$lib/server/services/github";
import dotenv from "dotenv";

dotenv.config();

export async function GET({ url }) {
    const number = Number(url.searchParams.get("number"));

    if (!number) {
        return json({ error: "Paramètre 'number' manquant" }, { status: 400 });
    }

    const owner = process.env.TARGET_OWNER!;
    const repo = process.env.TARGET_REPO!;

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

export async function POST({ request }) {
    const { issue } = await request.json();
    const result = await createIssuePlan(issue);
    return json(result);
}