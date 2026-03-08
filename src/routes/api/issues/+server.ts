import { json } from "@sveltejs/kit";
import { getIssues } from "$lib/server/services/github";
import { getCurrentProject } from "$lib/server/services/projects";

export async function GET() {
    try {
        const project = getCurrentProject();
        const owner = project?.owner;
        const repo  = project?.repo;

        if (!owner || !repo) {
            return json({ error: "Aucun owner/repo configuré pour ce projet" }, { status: 500 });
        }

        const issues = await getIssues(owner, repo);

        return json(
            issues.map(issue => ({
                number: issue.number,
                title: issue.title,
                state: issue.state,
                created: issue.created_at,
                labels: issue.labels.map(l =>
                    typeof l === "string"
                        ? { name: l, color: "555555" }
                        : { name: l.name ?? "", color: l.color ?? "555555" }
                )
            }))
        );
    } catch (err: any) {
        console.error("[/api/issues]", err);
        return json({ error: err.message ?? String(err) }, { status: 500 });
    }
}
