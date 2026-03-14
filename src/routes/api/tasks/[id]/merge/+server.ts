/** Tâches — crée une PR et merge la branche de la tâche (POST) */
import { json } from "@sveltejs/kit";
import { getTask, updateTask } from "$lib/server/services/tasks";
import { findOpenPullRequest, createPullRequest, mergePullRequest } from "$lib/server/services/github";
import { getMainBranch, checkoutMain } from "$lib/server/services/git";
import { getCurrentProject, getProjectRoot } from "$lib/server/services/projects";

/** Crée une PR GitHub pour la branche de la tâche */
export async function POST({ params }) {
    const task = getTask(params.id);
    if (!task) return json({ error: "Task introuvable" }, { status: 404 });
    if (!task.branch) return json({ error: "Pas de branche associée" }, { status: 400 });

    const project = getCurrentProject();
    const owner = project?.owner;
    const repo  = project?.repo;
    if (!owner || !repo) return json({ error: "Projet sans owner/repo configuré" }, { status: 400 });

    try {
        const root = getProjectRoot();
        const base = await getMainBranch(root);

        // Réutiliser une PR ouverte existante ou en créer une
        let pr = await findOpenPullRequest(owner, repo, task.branch, base);
        if (!pr) {
            const issueRef = task.issueNumber ? `\n\nCloses #${task.issueNumber}` : "";
            pr = await createPullRequest(
                owner, repo,
                task.title,
                `Implémentation de : ${task.title}${issueRef}`,
                task.branch,
                base
            );
        }

        await mergePullRequest(owner, repo, pr.number);
        await checkoutMain(root);
        return json(updateTask(params.id, { status: "merged" }));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // La branche est déjà mergée dans main → marquer comme merged
        if (message.includes("No commits between")) {
            try {
                const root = getProjectRoot();
                await checkoutMain(root);
            } catch { /* ignore */ }
            return json(updateTask(params.id, { status: "merged" }));
        }
        return json({ error: message }, { status: 500 });
    }
}
