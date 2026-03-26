import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getFullPlan } from "$lib/server/services/fullPlans";
import { closeIssue } from "$lib/server/services/github";
import { getCurrentProject } from "$lib/server/services/projects";

/**
 * POST /api/issues/groups/full-plans/[id]/close-issues
 * Ferme toutes les issues référencées dans le fullplan (subStacks + residualIssues).
 */
export const POST: RequestHandler = async ({ params }) => {
    const plan = getFullPlan(params.id);
    if (!plan) throw error(404, "Plan introuvable");

    const project = getCurrentProject();
    const owner = project?.owner;
    const repo  = project?.repo;
    if (!owner || !repo) throw error(400, "Projet sans owner/repo configuré");

    const allIssues = [
        ...plan.subStacks.flatMap(s => s.issues),
        ...(plan.residualIssues ?? []),
    ];

    const results: { number: number; ok: boolean; error?: string }[] = [];
    for (const issue of allIssues) {
        try {
            await closeIssue(owner, repo, issue.number);
            results.push({ number: issue.number, ok: true });
        } catch (err) {
            results.push({ number: issue.number, ok: false, error: err instanceof Error ? err.message : String(err) });
        }
    }

    const failed = results.filter(r => !r.ok);
    if (failed.length === allIssues.length) throw error(500, "Toutes les fermetures ont échoué");

    return json({ closed: results.filter(r => r.ok).length, total: allIssues.length, results });
};
