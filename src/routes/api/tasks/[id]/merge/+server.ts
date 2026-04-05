/** Tâches — crée une PR et merge la branche de la tâche (POST) */
import { json } from "@sveltejs/kit";
import { resolveTaskContext, updateTask } from "$lib/server/services/tasks";
import { findOpenPullRequest, createPullRequest, mergePullRequest } from "$lib/server/services/github";
import { getMainBranch, checkoutMain } from "$lib/server/services/git";
import { getCurrentProject, getProjectRoot } from "$lib/server/services/projects";
import { killProcess, isRunning } from "$lib/server/services/processes";
import { scanGodObjects } from "$lib/server/services/god-objects";
import { saveCssHistory, deleteCssAnalysis } from "$lib/server/services/css-history";
import { saveComponentHistory, deleteComponentAnalysis } from "$lib/server/services/component-history";

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

        const mergeResult = await mergePullRequest(owner, repo, pr.number);
        await checkoutMain(root);
        const merged = updateTask(params.id, { status: "merged" });
        if (task.type === "refacto") {
            setImmediate(() => { try { scanGodObjects(getProjectRoot()); } catch { /* silencieux */ } });
        }
        if (task.type === "css") {
            const sha: string = (mergeResult as any).sha ?? "";
            deleteCssAnalysis();
            saveCssHistory({
                date:      new Date().toISOString(),
                taskTitle: task.title,
                prUrl:     pr.html_url,
                commitUrl: sha ? `https://github.com/${owner}/${repo}/commit/${sha}` : pr.html_url,
                branch:    task.branch,
            });
        }
        if (task.type === "archi") {
            const sha: string = (mergeResult as any).sha ?? "";
            deleteComponentAnalysis();
            saveComponentHistory({
                date:      new Date().toISOString(),
                taskTitle: task.title,
                prUrl:     pr.html_url,
                commitUrl: sha ? `https://github.com/${owner}/${repo}/commit/${sha}` : pr.html_url,
                branch:    task.branch,
            });
        }
        return json(merged);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // La branche est déjà mergée dans main → marquer comme merged
        if (message.includes("No commits between")) {
            try {
                await checkoutMain(root);
            } catch { /* ignore */ }
            const merged = updateTask(params.id, { status: "merged" });
            if (task.type === "refacto") {
                setImmediate(() => { try { scanGodObjects(getProjectRoot()); } catch { /* silencieux */ } });
            }
            if (task.type === "css") {
                deleteCssAnalysis();
                saveCssHistory({
                    date:      new Date().toISOString(),
                    taskTitle: task.title,
                    prUrl:     pr.html_url,
                    commitUrl: pr.html_url,
                    branch:    task.branch,
                });
            }
            if (task.type === "archi") {
                deleteComponentAnalysis();
                saveComponentHistory({
                    date:      new Date().toISOString(),
                    taskTitle: task.title,
                    prUrl:     pr.html_url,
                    commitUrl: pr.html_url,
                    branch:    task.branch,
                });
            }
            return json(merged);
        }
        return json({ error: message }, { status: 500 });
    }
}
