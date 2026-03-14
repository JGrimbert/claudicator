import { json } from "@sveltejs/kit";
import { getTask } from "$lib/server/services/tasks";
import { buildContext } from "$lib/server/agent/context";
import { getProjectRoot, getCurrentProject } from "$lib/server/services/projects";
import { getIssue } from "$lib/server/services/github";

/** Crée le commit initial pour une task liée */
export async function POST({ request }) {
    const body = await request.json();
    const { taskId, projectRoot } = body;

    if (!taskId?.trim()) {
        return json({ error: "taskId manquant" }, { status: 400 });
    }

    const task = getTask(taskId);
    if (!task) {
        return json({ error: "Task introuvable" }, { status: 404 });
    }

    const root = projectRoot?.trim() || getProjectRoot();

    // Récupère le corps de l'issue GitHub si la task y est liée
    let description: string | undefined;
    if (task.issueNumber) {
        try {
            const project = getCurrentProject();
            const owner = project?.owner;
            const repo  = project?.repo;
            if (owner && repo) {
                const issue = await Promise.race([
                    getIssue(owner, repo, task.issueNumber),
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
                ]);
                description = issue.body ?? undefined;
            }
        } catch { /* GitHub indisponible — on continue sans description */ }
    }

    try {
        const ctx = buildContext(task, root, description);
        return json(ctx);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: `Échec de la construction du contexte : ${message}` }, { status: 500 });
    }
}
