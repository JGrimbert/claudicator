import type { RoadmapData, RoadmapStep } from 'jgr-ui';

export type IssueRef = { number: number; title: string; body?: string };

export type IssueGroup = {
    keyword: string;
    keywords: string[];
    issues: IssueRef[];
    score: number;
    hasParent: boolean;
    parentNumber: number | null;
    parentUrl: string | null;
    twins: number[][];
    subdivisions: { keyword: string; keywords: string[]; issues: IssueRef[] }[];
};

export type Stats = {
    totalIssues: number;
    groupCount: number;
    issuesInGroups: number;
    issuesOutOfGroups: number;
    ungroupedClusterCount: number;
    groupsWithParent: number;
};

export type CreatedParent = {
    parentNumber: number;
    title: string;
    html_url: string;
};

/** Tier de score : "hot" | "warm" | "cool" */
export function scoreTier(score: number, maxScore: number): string {
    const ratio = maxScore > 0 ? score / maxScore : 0;
    if (ratio >= 0.7) return 'hot';
    if (ratio >= 0.35) return 'warm';
    return 'cool';
}

/** Convertit les dépendances d'issues en structure RoadmapData */
export function depsToRoadmapData(
    issues: IssueRef[],
    deps: { from: number; to: number[] }[],
    complexity: Record<string, string>
): RoadmapData {
    const skillMap: Record<string, string> = { complexe: 'flow', moyen: 'domain', simple: 'utility' };
    const dependsOn: Record<number, number[]> = {};
    for (const { from, to } of deps) {
        for (const t of to) {
            dependsOn[t] = [...(dependsOn[t] ?? []), from];
        }
    }
    const steps: RoadmapStep[] = issues.map(i => ({
        id: i.number,
        label: `#${i.number}`,
        skill: skillMap[complexity[String(i.number)] ?? 'moyen'] ?? 'domain',
        nodes: [i.title.slice(0, 40)],
        files: [],
        rationale: i.title,
        dependsOnSteps: dependsOn[i.number] ?? [],
        issues: [i.number],
    }));
    const edgeCount = deps.reduce((acc, d) => acc + d.to.length, 0);
    return {
        steps,
        spine: [],
        stats: { nodes: issues.length, edges: edgeCount, levels: 0, steps: issues.length }
    };
}
