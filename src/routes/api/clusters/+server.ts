/** Clusters de symboles — par dossier, patterns mixtes cross-dir, coalescence (GET) */
import { json } from "@sveltejs/kit";
import { getCurrentProject, getProjectRoot } from "$lib/server/services/projects";
import { getIssuesWithBodies } from "$lib/server/services/github";
import { searchMethods } from "$lib/server/services/cartography";

export type SymbolEntry = { name: string; issues: number[] };

export type DirCluster = {
    dir:     string;
    symbols: SymbolEntry[];
    issues:  number[];
    count:   number;
};

export type MixedSymbol = { name: string; dir: string; issues: number[] };

export type MixedCluster = {
    dirs:    string[];
    symbols: MixedSymbol[];
    issues:  number[];
    count:   number;
};

/** Un symbole dans un nœud de coalescence */
export type CoalSymbol = { key: string; dir: string };

/**
 * Concept fermé : ensemble d'issues partageant un ensemble maximal de symboles.
 * score = symbols.length × issues.length (densité de la coalescence)
 */
export type CoalNode = {
    symbols: CoalSymbol[];
    issues:  number[];
    score:   number;
    count:   number;
};

export type ClustersResponse = {
    dirs:  DirCluster[];
    mixed: MixedCluster[];
    coal:  CoalNode[];
};

function parentDir(filePath: string): string {
    const parts = filePath.replace(/\\/g, "/").split("/");
    return parts.length >= 2 ? (parts[parts.length - 2] || "root") : "root";
}

function makeUF() {
    const p = new Map<number, number>();
    function find(x: number): number {
        if (!p.has(x)) p.set(x, x);
        const root = p.get(x)! === x ? x : find(p.get(x)!);
        p.set(x, root);
        return root;
    }
    function union(a: number, b: number) {
        const ra = find(a), rb = find(b);
        if (ra !== rb) p.set(ra, rb);
    }
    return { find, union };
}

export async function GET() {
    const owner = getCurrentProject()?.owner ?? "";
    const repo  = getCurrentProject()?.repo  ?? "";
    const root  = getProjectRoot();

    const empty: ClustersResponse = { dirs: [], mixed: [], coal: [] };
    if (!owner || !repo) return json(empty, { status: 200 });

    let issues: { number: number; title: string; body: string | null }[] = [];
    try {
        issues = await getIssuesWithBodies(owner, repo);
    } catch {
        return json(empty, { status: 200 });
    }

    // ── 1. dirMap + issueToSymbols (une seule boucle) ────────────────────────
    const dirMap        = new Map<string, { symbols: Map<string, Set<number>>; issues: Set<number> }>();
    const symbolToIssues = new Map<string, Set<number>>();
    const issueToSymbols = new Map<number, Set<string>>();
    const symbolDir      = new Map<string, string>(); // key → premier dir trouvé

    for (const issue of issues) {
        const hits = searchMethods(issue.title, root);
        for (const { key, method } of hits) {
            const dir = parentDir(method.file ?? "");

            // dirMap
            if (!dirMap.has(dir)) dirMap.set(dir, { symbols: new Map(), issues: new Set() });
            const entry = dirMap.get(dir)!;
            if (!entry.symbols.has(key)) entry.symbols.set(key, new Set());
            entry.symbols.get(key)!.add(issue.number);
            entry.issues.add(issue.number);

            // coalescence index
            if (!symbolToIssues.has(key)) symbolToIssues.set(key, new Set());
            symbolToIssues.get(key)!.add(issue.number);
            if (!issueToSymbols.has(issue.number)) issueToSymbols.set(issue.number, new Set());
            issueToSymbols.get(issue.number)!.add(key);
            if (!symbolDir.has(key)) symbolDir.set(key, dir);
        }
    }

    // ── 2. DirClusters ───────────────────────────────────────────────────────
    const dirs: DirCluster[] = [];
    for (const [dir, { symbols, issues: issueSet }] of dirMap) {
        if (issueSet.size < 2) continue;
        dirs.push({
            dir,
            symbols: [...symbols.entries()]
                .map(([name, nums]) => ({ name, issues: [...nums].sort((a, b) => a - b) }))
                .sort((a, b) => a.name.localeCompare(b.name)),
            issues: [...issueSet].sort((a, b) => a - b),
            count:  issueSet.size,
        });
    }
    dirs.sort((a, b) => b.count - a.count || a.dir.localeCompare(b.dir));

    // ── 3. Mixed clusters (cross-directory, union-find strict ≥ 2 dirs) ──────
    const issueToDir = new Map<number, Set<string>>();
    for (const [dir, { issues: issueSet }] of dirMap) {
        for (const n of issueSet) {
            if (!issueToDir.has(n)) issueToDir.set(n, new Set());
            issueToDir.get(n)!.add(dir);
        }
    }
    const crossIssues = [...issueToDir.entries()]
        .filter(([, ds]) => ds.size >= 2)
        .map(([num, ds]) => ({ num, dirs: ds }));

    const mixed: MixedCluster[] = [];
    if (crossIssues.length > 0) {
        const uf = makeUF();
        for (let i = 0; i < crossIssues.length; i++) {
            for (let j = i + 1; j < crossIssues.length; j++) {
                const { num: a, dirs: da } = crossIssues[i];
                const { num: b, dirs: db } = crossIssues[j];
                if ([...da].filter(d => db.has(d)).length >= 2) uf.union(a, b);
            }
        }
        const compMap = new Map<number, { issues: Set<number>; dirs: Set<string> }>();
        for (const { num, dirs: ds } of crossIssues) {
            const r = uf.find(num);
            if (!compMap.has(r)) compMap.set(r, { issues: new Set(), dirs: new Set() });
            compMap.get(r)!.issues.add(num);
            for (const d of ds) compMap.get(r)!.dirs.add(d);
        }
        for (const { issues: issSet, dirs: dsSet } of compMap.values()) {
            if (issSet.size < 3 || dsSet.size < 2) continue;
            const syms: MixedSymbol[] = [];
            for (const dir of dsSet) {
                const entry = dirMap.get(dir);
                if (!entry) continue;
                for (const [name, symIssues] of entry.symbols) {
                    const relevant = [...symIssues].filter(n => issSet.has(n));
                    if (relevant.length >= 2)
                        syms.push({ name, dir, issues: relevant.sort((a, b) => a - b) });
                }
            }
            syms.sort((a, b) => a.dir.localeCompare(b.dir) || a.name.localeCompare(b.name));
            mixed.push({
                dirs:    [...dsSet].sort(),
                symbols: syms,
                issues:  [...issSet].sort((a, b) => a - b),
                count:   issSet.size,
            });
        }
        mixed.sort((a, b) => b.count - a.count || a.dirs.join().localeCompare(b.dirs.join()));
    }

    // ── 4. Coalescence (concepts fermés) ─────────────────────────────────────
    // Symboles fréquents : présents dans ≥ 2 issues
    const freqSyms = [...symbolToIssues.entries()]
        .filter(([, iss]) => iss.size >= 2)
        .map(([sym]) => sym);

    // Pour chaque paire de symboles fréquents → issues communes → extension maximale de symboles
    // Clé = ensemble d'issues (déduplication : un même ensemble d'issues donne toujours la même extension)
    const coalByIssues = new Map<string, { symbols: CoalSymbol[]; issues: number[] }>();

    for (let i = 0; i < freqSyms.length; i++) {
        for (let j = i + 1; j < freqSyms.length; j++) {
            const sa = symbolToIssues.get(freqSyms[i])!;
            const sb = symbolToIssues.get(freqSyms[j])!;
            const common = [...sa].filter(n => sb.has(n)).sort((a, b) => a - b);
            if (common.length < 2) continue;

            const issKey = common.join(",");
            if (coalByIssues.has(issKey)) continue; // déjà calculé pour cet ensemble d'issues

            // Extension maximale : tous les symboles fréquents présents dans TOUTES les issues communes
            const extSyms: CoalSymbol[] = freqSyms
                .filter(s => common.every(n => issueToSymbols.get(n)?.has(s)))
                .map(s => ({ key: s, dir: symbolDir.get(s) ?? "" }))
                .sort((a, b) => a.key.localeCompare(b.key));

            if (extSyms.length < 2) continue;

            coalByIssues.set(issKey, { symbols: extSyms, issues: common });
        }
    }

    const coal: CoalNode[] = [];
    for (const { symbols, issues } of coalByIssues.values()) {
        coal.push({
            symbols,
            issues,
            score: symbols.length * issues.length,
            count: issues.length,
        });
    }
    coal.sort((a, b) => b.score - a.score || b.count - a.count);

    return json({ dirs, mixed, coal });
}
