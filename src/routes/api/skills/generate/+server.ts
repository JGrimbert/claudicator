/** Skills — génère les proposals via Claude Haiku (POST) */
import { json }          from "@sveltejs/kit";
import { getHistoryState } from "$lib/server/services/git-history";
import {
    loadProposals,
    saveProposals,
    slugify,
    buildPrompt,
    parseHaikuResponse,
    invokeHaiku,
} from "$lib/server/services/skill-proposals";
import type { SkillProposal } from "$lib/server/services/skill-proposals";

type CoalSymbol = { key: string; dir: string };
type CoalNode   = {
    symbols:    CoalSymbol[];
    issues:     number[];
    score:      number;
    count:      number;
    histMatch?: { symbols: string[]; count: number; issues: number[] };
};
type HistCoalNode = { symbols: string[]; count: number; score: number; issues: number[] };

export async function POST({ fetch }: { fetch: typeof globalThis.fetch }) {
    // 1. Clusters sémantiques via la route existante
    const clustersRes = await fetch("/api/clusters");
    if (!clustersRes.ok) {
        return json({ error: "Impossible de récupérer les clusters" }, { status: 500 });
    }
    const clustersData = await clustersRes.json();
    const coal: CoalNode[]     = clustersData.coal ?? [];

    // 2. Coalescence historique depuis le state
    const hist = getHistoryState();
    const historicalCoal: HistCoalNode[] = hist.coal ?? [];

    // 3. Filtrage par seuil
    const filteredCoal = coal.filter(n => n.score >= 6);
    const filteredHist = historicalCoal.filter(n => n.score >= 9 && n.count >= 3);

    // 4. Déduplication : exclure les nœuds historiques déjà couverts par un histMatch
    const matchedHistSets = new Set(
        coal
            .filter(n => n.histMatch)
            .map(n => (n.histMatch!.symbols ?? []).slice().sort().join(",")),
    );
    const dedupedHist = filteredHist.filter(
        n => !matchedHistSets.has(n.symbols.slice().sort().join(",")),
    );

    // 5. Génération (synchrone — un appel haiku par cluster)
    const proposals: SkillProposal[] = [];

    for (const node of filteredCoal) {
        const symbols = node.symbols.map(s => s.key);
        const prompt  = buildPrompt(symbols, "coal", node.issues, node.count);
        try {
            const raw = invokeHaiku(prompt);
            const { skill, description } = parseHaikuResponse(raw);
            proposals.push({
                id: slugify(symbols),
                skill,
                source: "coal",
                description,
                clusterSymbols: symbols,
                clusterIssues:  node.issues,
                score:          node.score,
                generatedAt:    new Date().toISOString(),
            });
        } catch {
            proposals.push({
                id:             slugify(symbols),
                skill:          "unknown",
                source:         "coal",
                description:    "",
                clusterSymbols: symbols,
                clusterIssues:  node.issues,
                score:          node.score,
                generatedAt:    new Date().toISOString(),
            });
        }
    }

    for (const node of dedupedHist) {
        const symbols = node.symbols;
        const prompt  = buildPrompt(symbols, "historical", node.issues, node.count);
        try {
            const raw = invokeHaiku(prompt);
            const { skill, description } = parseHaikuResponse(raw);
            proposals.push({
                id: slugify(symbols),
                skill,
                source: "historical",
                description,
                clusterSymbols: symbols,
                clusterIssues:  node.issues,
                score:          node.score,
                generatedAt:    new Date().toISOString(),
            });
        } catch {
            proposals.push({
                id:             slugify(symbols),
                skill:          "unknown",
                source:         "historical",
                description:    "",
                clusterSymbols: symbols,
                clusterIssues:  node.issues,
                score:          node.score,
                generatedAt:    new Date().toISOString(),
            });
        }
    }

    saveProposals(proposals);
    return json({ proposals, generated: proposals.length });
}
