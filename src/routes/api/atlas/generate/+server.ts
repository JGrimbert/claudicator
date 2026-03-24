/** Atlas generate — génère ATLAS.md pour claudicator depuis l'index symbolique (POST) */
import { json } from "@sveltejs/kit";
import { getTask } from "$lib/server/services/tasks";
import { writeAtlasMd } from "$lib/server/agent/atlas";
import { getCurrentProject } from "$lib/server/services/projects";
import { getIssue } from "$lib/server/services/github";

/**
 * Génère ATLAS.md à la racine de claudicator.
 * Contient :
 *   - Points d'entrée : symboles pertinents pour l'issue liée à la task
 *   - Index complet  : toutes les méthodes exportées de claudicator
 */
export async function POST({ request }) {
    const body = await request.json();
    const { taskId } = body;

    if (!taskId?.trim()) {
        return json({ error: "taskId manquant" }, { status: 400 });
    }

    const task = getTask(taskId);
    if (!task) {
        return json({ error: "Task introuvable" }, { status: 404 });
    }

    // Récupère le corps de l'issue GitHub si disponible
    let description: string | undefined;
    if (task.issueNumber) {
        try {
            const project = getCurrentProject();
            if (project?.owner && project?.repo) {
                const issue = await Promise.race([
                    getIssue(project.owner, project.repo, task.issueNumber),
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
                ]);
                description = issue.body ?? undefined;
            }
        } catch { /* GitHub indisponible — on continue sans description */ }
    }

    const { entryPoints, tokenCost } = writeAtlasMd(task, description);
    return json({ ok: true, entryPoints, tokenCost });
}
