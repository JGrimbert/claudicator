/** Tâches — crée une PR et merge la branche de la tâche (POST) */
import { json } from "@sveltejs/kit";
import { resolveTaskContext, updateTask } from "$lib/server/services/tasks";
import { findOpenPullRequest, createPullRequest, mergePullRequest } from "$lib/server/services/github";
import { getMainBranch, checkoutMain } from "$lib/server/services/git";
import { getCurrentProject } from "$lib/server/services/projects";
import { killProcess, isRunning } from "$lib/server/services/processes";

/** Crée une PR GitHub pour la branche de la tâche */
export async function POST({ params }) {
    const ctx = resolveTaskContext(params.id);
    if (!ctx) return json({ error: "Task introuvable" }, { status: 404 });
    const { task, projectRoot: root } = ctx;
    if (!task.branch) return json({ error: "Pas de branche associée" }, { status: 400 });

    const project = getCurrentProject();
    const owner = project?.owner;
    const repo  = project?.repo;
    if (!owner || !repo) return json({ error: "Projet sans owner/repo configuré" }, { status: 400 });

    // issue #91 : tuer le process actif si présent avant de merger
    if (isRunning(params.id)) {
        killProcess(params.id);
    }

    try {
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
                await checkoutMain(root);
            } catch { /* ignore */ }
            return json(updateTask(params.id, { status: "merged" }));
        }
        return json({ error: message }, { status: 500 });
    }
}
