import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getCurrentProject } from "$lib/server/services/projects";
import { getIssuesWithBodies } from "$lib/server/services/github";
import { detectIssueGroups } from "$lib/server/agent/issue-grouping";

/**
 * GET /api/issues/groups?min=3
 * Retourne { groups, stats } pour l'affichage des regroupements.
 */
export const GET: RequestHandler = async ({ url }) => {
    const minIssues = Math.max(2, Number(url.searchParams.get("min") ?? "3"));

    const project = getCurrentProject();
    const owner = project?.owner ?? process.env.TARGET_OWNER!;
    const repo  = project?.repo  ?? process.env.TARGET_REPO!;

    const issues = await getIssuesWithBodies(owner, repo);
    const groups = detectIssueGroups(issues, { minIssues });

    // Pour chaque groupe : vérifier si une issue parente existe + récupérer son numéro/url
    const result = groups.map(g => {
        const parentIssue = issues.find(i =>
            g.keywords.every(kw => i.title.toLowerCase().includes(kw))
        );
        return {
            ...g,
            hasParent:   !!parentIssue,
            parentNumber: parentIssue?.number ?? null,
            parentUrl:    parentIssue?.html_url ?? null,
        };
    });

    // Stats globales
    const issueNumbersInGroups = new Set(result.flatMap(g => g.issues.map(i => i.number)));
    const stats = {
        totalIssues:       issues.length,
        groupCount:        result.length,
        issuesInGroups:    issueNumbersInGroups.size,
        issuesOutOfGroups: issues.length - issueNumbersInGroups.size,
        groupsWithParent:  result.filter(g => g.hasParent).length,
    };

    return json({ groups: result, stats });
};
