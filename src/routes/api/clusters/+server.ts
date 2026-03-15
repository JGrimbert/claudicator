/** Clusters de symboles — agrégation par dossier + patterns mixtes cross-directory (GET) */
import { json } from "@sveltejs/kit";
import { getCurrentProject, getProjectRoot } from "$lib/server/services/projects";
import { getIssuesWithBodies } from "$lib/server/services/github";
import { searchMethods } from "$lib/server/services/cartography";

export type SymbolEntry = { name: string; issues: number[] };

export type DirCluster = {
    dir:     string;
    symbols: SymbolEntry[];  // par symbole : ses issues propres
    issues:  number[];       // union de toutes les issues du dossier
    count:   number;
};

export type MixedSymbol = { name: string; dir: string; issues: number[] };

export type MixedCluster = {
    dirs:    string[];        // dossiers touchés (≥ 2)
    symbols: MixedSymbol[];   // symboles impliqués, avec leurs issues
    issues:  number[];        // union de toutes les issues du cluster
    count:   number;
};

export type ClustersResponse = {
    dirs:  DirCluster[];
    mixed: MixedCluster[];
};

function parentDir(filePath: string): string {
    const parts = filePath.replace(/\\/g, "/").split("/");
    return parts.length >= 2 ? (parts[parts.length - 2] || "root") : "root";
}

/** Union-Find path-compressed */
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

    const empty: ClustersResponse = { dirs: [], mixed: [] };
    if (!owner || !repo) return json(empty, { status: 200 });

    let issues: { number: number; title: string; body: string | null }[] = [];
    try {
        issues = await getIssuesWithBodies(owner, repo);
    } catch {
        return json(empty, { status: 200 });
    }

    // ── 1. Construction du dirMap ─────────────────────────────────────────────
    // dir → { symbols: Map<key, Set<issueNum>>, issues: Set<issueNum> }
    const dirMap = new Map<string, { symbols: Map<string, Set<number>>; issues: Set<number> }>();

    for (const issue of issues) {
        const hits = searchMethods(issue.title, root);
        for (const { key, method } of hits) {
            const dir = parentDir(method.file ?? "");
            if (!dirMap.has(dir)) dirMap.set(dir, { symbols: new Map(), issues: new Set() });
            const entry = dirMap.get(dir)!;
            if (!entry.symbols.has(key)) entry.symbols.set(key, new Set());
            entry.symbols.get(key)!.add(issue.number);
            entry.issues.add(issue.number);
        }
    }

    // ── 2. DirClusters (existant) ─────────────────────────────────────────────
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

    // ── 3. Mixed clusters (cross-directory) ───────────────────────────────────
    // issueToDir : issue → ensemble des dossiers où elle apparaît
    const issueToDir = new Map<number, Set<string>>();
    for (const [dir, { issues: issueSet }] of dirMap) {
        for (const n of issueSet) {
            if (!issueToDir.has(n)) issueToDir.set(n, new Set());
            issueToDir.get(n)!.add(dir);
        }
    }

    // Ne garder que les issues qui touchent ≥ 2 dossiers
    const crossIssues = [...issueToDir.entries()]
        .filter(([, ds]) => ds.size >= 2)
        .map(([num, ds]) => ({ num, dirs: ds }));

    if (crossIssues.length === 0) return json({ dirs, mixed: [] });

    // Union-Find : connecter deux issues si elles partagent ≥ 1 dossier
    const uf = makeUF();
    for (let i = 0; i < crossIssues.length; i++) {
        for (let j = i + 1; j < crossIssues.length; j++) {
            const { num: a, dirs: da } = crossIssues[i];
            const { num: b, dirs: db } = crossIssues[j];
            if ([...da].some(d => db.has(d))) uf.union(a, b);
        }
    }

    // Agréger par composante connexe
    const compMap = new Map<number, { issues: Set<number>; dirs: Set<string> }>();
    for (const { num, dirs: ds } of crossIssues) {
        const root = uf.find(num);
        if (!compMap.has(root)) compMap.set(root, { issues: new Set(), dirs: new Set() });
        compMap.get(root)!.issues.add(num);
        for (const d of ds) compMap.get(root)!.dirs.add(d);
    }

    // Construire les MixedClusters
    const mixed: MixedCluster[] = [];
    for (const { issues: issSet, dirs: dsSet } of compMap.values()) {
        if (issSet.size < 2 || dsSet.size < 2) continue;

        // Collecter les symboles impliqués (depuis dirMap, filtrés par dossier + issues du cluster)
        const syms: MixedSymbol[] = [];
        for (const dir of dsSet) {
            const entry = dirMap.get(dir);
            if (!entry) continue;
            for (const [name, symIssues] of entry.symbols) {
                const relevant = [...symIssues].filter(n => issSet.has(n));
                if (relevant.length > 0) {
                    syms.push({ name, dir, issues: relevant.sort((a, b) => a - b) });
                }
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

    return json({ dirs, mixed });
}
