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

    const issueBodyMap = new Map(issues.map(i => [i.number, i.body ?? ""]));

    // Pour chaque groupe : vérifier si une issue parente existe + récupérer son numéro/url
    const result = groups.map(g => {
        const parentIssue = issues.find(i =>
            g.keywords.every(kw => i.title.toLowerCase().includes(kw))
        );
        return {
            ...g,
            issues: g.issues.map(i => ({ ...i, body: issueBodyMap.get(i.number) ?? "" })),
            subdivisions: (g.subdivisions ?? []).map(s => ({
                ...s,
                issues: s.issues.map(i => ({ ...i, body: issueBodyMap.get(i.number) ?? "" }))
            })),
            hasParent:   !!parentIssue,
            parentNumber: parentIssue?.number ?? null,
            parentUrl:    parentIssue?.html_url ?? null,
        };
    });

    // Stats globales
    const issueNumbersInGroups = new Set(result.flatMap(g => g.issues.map(i => i.number)));
    const ungroupedFull = issues.filter(i => !issueNumbersInGroups.has(i.number));

    // Micro-groupes sémantiques parmi les hors-groupes (seuil minIssues=2)
    const ungroupedClusters = detectIssueGroups(ungroupedFull, { minIssues: 2 });
    const clusteredNums = new Set(ungroupedClusters.flatMap(g => g.issues.map(i => i.number)));

    const ungroupedIssues = ungroupedFull
        .filter(i => !clusteredNums.has(i.number))
        .map(i => ({ number: i.number, title: i.title }));

    const stats = {
        totalIssues:           issues.length,
        groupCount:            result.length,
        issuesInGroups:        issueNumbersInGroups.size,
        issuesOutOfGroups:     ungroupedFull.length,
        ungroupedClusterCount: ungroupedClusters.length,
        groupsWithParent:      result.filter(g => g.hasParent).length,
    };

    return json({ groups: result, ungroupedClusters, ungroupedIssues, stats });
};
