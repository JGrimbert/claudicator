/** Clusters de symboles — symboles partagés par plusieurs issues (GET) */
import { json } from "@sveltejs/kit";
import { getCurrentProject, getProjectRoot } from "$lib/server/services/projects";
import { getIssuesWithBodies } from "$lib/server/services/github";
import { searchMethods } from "$lib/server/services/cartography";

export type Cluster = {
    symbol: string;
    file:   string;
    issues: number[];
    count:  number;
};

/** Retourne les symboles présents dans au moins 2 issues open */
export async function GET() {
    const owner = getCurrentProject()?.owner ?? "";
    const repo  = getCurrentProject()?.repo  ?? "";
    const root  = getProjectRoot();

    if (!owner || !repo) return json([], { status: 200 });

    let issues: { number: number; title: string; body: string | null }[] = [];
    try {
        issues = await getIssuesWithBodies(owner, repo);
    } catch {
        return json([], { status: 200 });
    }

    // Pour chaque issue, obtenir les symboles pertinents
    const symbolMap = new Map<string, { file: string; issues: Set<number> }>();

    for (const issue of issues) {
        const hits = searchMethods(issue.title, root);
        for (const { key, method } of hits) {
            if (!symbolMap.has(key)) {
                symbolMap.set(key, { file: method.file ?? "", issues: new Set() });
            }
            symbolMap.get(key)!.issues.add(issue.number);
        }
    }

    // Garder seulement les symboles présents dans 2+ issues
    const clusters: Cluster[] = [];
    for (const [symbol, { file, issues: issueSet }] of symbolMap) {
        if (issueSet.size >= 2) {
            clusters.push({ symbol, file, issues: [...issueSet].sort((a, b) => a - b), count: issueSet.size });
        }
    }

    clusters.sort((a, b) => b.count - a.count);
    return json(clusters);
}
