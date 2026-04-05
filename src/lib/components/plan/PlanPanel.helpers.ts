// ── Types ─────────────────────────────────────────────────────────────────

export type SymbolEntry  = { name: string; issues: number[] };
export type DirCluster   = { dir: string; symbols: SymbolEntry[]; issues: number[]; count: number };
export type MixedSymbol  = { name: string; dir: string; issues: number[] };
export type MixedCluster = { dirs: string[]; symbols: MixedSymbol[]; issues: number[]; count: number };
export type CoalSymbol   = { key: string; dir: string };
export type CoalNode     = { symbols: CoalSymbol[]; issues: number[]; score: number; count: number; histMatch?: { symbols: string[]; count: number; issues: number[] } };
export type HistCoalNode = { symbols: string[]; count: number; score: number };
export type IssueSlot    = { issueNumber: number; commitCount: number; symbols: string[] };
export type HistoryStats = {
    totalCommits:       number;
    commitsWithSymbols: number;
    uniqueSymbols:      number;
    uniqueIssues:       number;
    symbolPairs:        number;
    conceptCount:       number;
};
export type ClusterSkill  = { id: string; name: string; file: string };
export type SkillProposal = {
    id: string; skill: string; source: "coal" | "historical";
    description: string; clusterSymbols: string[]; clusterIssues: number[];
    score: number; generatedAt: string;
};
export type SkillCandidate = { symbols: string[]; count: number; score: number; source: "coal" | "hist" | "commit" };

export type PlanGroupBase = { name: string; issues: number[]; index: number; summary: string; dependsOn: string[] };

// ── Fonctions pures ───────────────────────────────────────────────────────

/**
 * Regroupe une liste d'issues en fonction des plan groups correspondants.
 * Les issues sans groupe sont placées dans un groupe "autres".
 */
export function groupIssuesByPlanGroup(
    issues: number[],
    groups: PlanGroupBase[]
): { name: string; issues: number[] }[] {
    if (issues.length === 0) return [];
    if (groups.length === 0) return [{ name: "", issues }];
    const result: { name: string; issues: number[] }[] = [];
    const seen = new Set<number>();
    for (const g of groups) {
        const matched = issues.filter(n => g.issues.includes(n));
        if (matched.length > 0) {
            result.push({ name: g.name, issues: matched });
            matched.forEach(n => seen.add(n));
        }
    }
    const others = issues.filter(n => !seen.has(n));
    if (others.length > 0) result.push({ name: "autres", issues: others });
    return result.length > 0 ? result : [{ name: "", issues }];
}

/**
 * Élimine les candidats dont l'ensemble de symboles est un sous-ensemble
 * d'un candidat déjà retenu (déduplication par inclusion).
 */
export function candDeduplicateSubsets(nodes: SkillCandidate[]): SkillCandidate[] {
    const retained: SkillCandidate[] = [];
    for (const node of nodes) {
        const symSet = new Set(node.symbols);
        const dominated = retained.some(k => {
            const kSym = new Set(k.symbols);
            return [...symSet].every(s => kSym.has(s));
        });
        if (!dominated) retained.push(node);
    }
    return retained;
}

/**
 * Élimine les candidats trop similaires par similarité de Jaccard.
 * Un candidat est éliminé si son Jaccard avec un candidat déjà retenu >= threshold.
 */
export function candDeduplicateByJaccard(nodes: SkillCandidate[], threshold: number): SkillCandidate[] {
    const retained: SkillCandidate[] = [];
    for (const node of nodes) {
        const symSet = new Set(node.symbols);
        const similar = retained.some(k => {
            const kSym  = new Set(k.symbols);
            const inter = [...symSet].filter(s => kSym.has(s)).length;
            const union = new Set([...symSet, ...kSym]).size;
            return union > 0 && inter / union >= threshold;
        });
        if (!similar) retained.push(node);
    }
    return retained;
}

/**
 * Calcule les symboles associés à l'étape active (dédup par nom).
 */
export function computeStepSymbols(
    stepDirs: DirCluster[],
    stepCoal: CoalNode[],
    stepIssues: Set<number>
): { name: string; dir: string }[] {
    const seen   = new Set<string>();
    const result: { name: string; dir: string }[] = [];
    for (const c of stepDirs) {
        for (const s of c.symbols) {
            if (s.issues.some(n => stepIssues.has(n)) && !seen.has(s.name)) {
                seen.add(s.name);
                result.push({ name: s.name, dir: c.dir });
            }
        }
    }
    for (const c of stepCoal) {
        for (const s of c.symbols) {
            if (!seen.has(s.key)) {
                seen.add(s.key);
                result.push({ name: s.key, dir: s.dir });
            }
        }
    }
    return result;
}

/**
 * Calcule la liste des candidats skills à partir des données coal, hist et commit.
 * Applique les seuils, déduplications et cap à 12 résultats.
 */
export function computeSkillCandidates(
    coal: CoalNode[],
    histCoal: HistCoalNode[],
    commitClusters: HistCoalNode[]
): SkillCandidate[] {
    // 1. coal — score ≥ 6 et count ≥ 3, dédup subsets puis Jaccard
    const coalRaw: SkillCandidate[] = coal
        .filter(n => n.score >= 6 && n.count >= 3)
        .map(n => ({ symbols: n.symbols.map(s => s.key), count: n.count, score: n.score, source: "coal" as const }));
    const coalDedup = candDeduplicateByJaccard(candDeduplicateSubsets(coalRaw), 0.6);

    // 2. hist — score ≥ 9 et count ≥ 3, exclure les nœuds déjà couverts par histMatch sémantique
    const coalMatchedSyms = new Set(
        coal.filter(n => n.histMatch).map(n => (n.histMatch!.symbols ?? []).slice().sort().join(","))
    );
    const histRaw: SkillCandidate[] = histCoal
        .filter(n => n.score >= 9 && n.count >= 3)
        .filter(n => !coalMatchedSyms.has([...n.symbols].sort().join(",")))
        .map(n => ({ symbols: n.symbols, count: n.count, score: n.score, source: "hist" as const }));

    // 3. commitClusters — count ≥ 3, exclure doublons hist
    const histSymSets = new Set(histCoal.map(n => [...n.symbols].sort().join(",")));
    const commitRaw: SkillCandidate[] = commitClusters
        .filter(n => n.count >= 3 && !histSymSets.has([...n.symbols].sort().join(",")))
        .map(n => ({ symbols: n.symbols, count: n.count, score: n.score, source: "commit" as const }));

    // 4. Merge, tri score desc, dédup Jaccard cross-source, cap 12
    const merged = [...coalDedup, ...histRaw, ...commitRaw].sort((a, b) => b.score - a.score);
    return candDeduplicateByJaccard(merged, 0.6).slice(0, 12);
}
