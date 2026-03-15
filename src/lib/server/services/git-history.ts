/** Historique git — collecte progressive des co-modifications de symboles */
import fs   from "fs";
import path from "path";
import { searchMethods } from "./cartography";

// ── Types ────────────────────────────────────────────────────────────────────

export type CommitRecord = {
    sha:       string;
    symbols:   string[];    // clés de symboles modifiés dans ce commit
    issueRefs: number[];    // numéros d'issues cités dans le message (#N)
};

export type IssueSlot = {
    issueNumber: number;
    commitCount: number;
    symbols:     string[];
};

export type HistoricalCoalNode = {
    symbols: string[];
    count:   number;    // nombre de commits où ces symboles co-apparaissent
    score:   number;    // symbols.length × count
};

export type GitHistoryState = {
    lastProcessedSha: string | null;
    headSha:          string | null;
    processedCount:   number;
    coal:             HistoricalCoalNode[];
    updatedAt:        string;
};

// ── Chemins ──────────────────────────────────────────────────────────────────

function historyDir():  string { return ".agent/git-history"; }
function commitsDir():  string { return path.join(historyDir(), "commits"); }
function statePath():   string { return path.join(historyDir(), "state.json"); }

export function ensureHistoryDir(): void {
    fs.mkdirSync(commitsDir(), { recursive: true });
}

// ── State ────────────────────────────────────────────────────────────────────

export function getHistoryState(): GitHistoryState {
    ensureHistoryDir();
    if (!fs.existsSync(statePath())) {
        return { lastProcessedSha: null, headSha: null, processedCount: 0, coal: [], updatedAt: "" };
    }
    return JSON.parse(fs.readFileSync(statePath(), "utf-8"));
}

export function saveHistoryState(state: GitHistoryState): void {
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
}

// ── Commits ──────────────────────────────────────────────────────────────────

export function isCommitProcessed(sha: string): boolean {
    return fs.existsSync(path.join(commitsDir(), `${sha}.json`));
}

export function saveCommitRecord(record: CommitRecord): void {
    fs.writeFileSync(
        path.join(commitsDir(), `${record.sha}.json`),
        JSON.stringify(record, null, 2)
    );
}

export function loadAllCommitRecords(): CommitRecord[] {
    ensureHistoryDir();
    return fs.readdirSync(commitsDir())
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(commitsDir(), f), "utf-8")) as CommitRecord);
}

export type HistoryStats = {
    totalCommits:       number;   // commits enregistrés
    commitsWithSymbols: number;   // commits où des symboles ont été trouvés
    uniqueSymbols:      number;   // symboles distincts sur l'ensemble
    uniqueIssues:       number;   // issues distinctes citées dans les messages
    symbolPairs:        number;   // paires co-modifiées (fréquentes ≥2 commits)
    conceptCount:       number;   // nœuds de coalescence historique
};

/** Calcule les statistiques globales de l'historique analysé. */
export function getHistoryStats(): HistoryStats {
    const records = loadAllCommitRecords();
    const state   = getHistoryState();
    const symSet  = new Set<string>();
    const issSet  = new Set<number>();
    // index sym → commits pour compter les paires fréquentes
    const symCommits = new Map<string, Set<number>>();
    let commitsWithSymbols = 0;

    for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        if (rec.symbols.length > 0) commitsWithSymbols++;
        for (const s of rec.symbols) {
            symSet.add(s);
            if (!symCommits.has(s)) symCommits.set(s, new Set());
            symCommits.get(s)!.add(i);
        }
        for (const n of (rec.issueRefs ?? [])) issSet.add(n);
    }

    // Paires de symboles co-modifiés dans ≥2 commits
    const freqSyms = [...symCommits.entries()].filter(([, s]) => s.size >= 2).map(([k]) => k);
    let pairs = 0;
    for (let i = 0; i < freqSyms.length; i++) {
        for (let j = i + 1; j < freqSyms.length; j++) {
            const ca = symCommits.get(freqSyms[i])!;
            const cb = symCommits.get(freqSyms[j])!;
            if ([...ca].some(n => cb.has(n))) pairs++;
        }
    }

    return {
        totalCommits:       records.length,
        commitsWithSymbols,
        uniqueSymbols:      symSet.size,
        uniqueIssues:       issSet.size,
        symbolPairs:        pairs,
        conceptCount:       state.coal.length,
    };
}

/** Extrait les numéros d'issue (#N) cités dans un message de commit. */
export function parseIssueRefs(message: string): number[] {
    return [...message.matchAll(/#(\d+)/g)]
        .map(m => parseInt(m[1]))
        .filter((n, i, a) => !isNaN(n) && a.indexOf(n) === i);
}

/**
 * Retourne les slots d'issues : agrège commits + symboles par numéro d'issue.
 * Triés par nombre de commits décroissant.
 */
export function getIssueSlots(): IssueSlot[] {
    const records = loadAllCommitRecords();
    const map = new Map<number, { commits: number; symbols: Set<string> }>();
    for (const rec of records) {
        for (const n of (rec.issueRefs ?? [])) {
            if (!map.has(n)) map.set(n, { commits: 0, symbols: new Set() });
            const slot = map.get(n)!;
            slot.commits++;
            for (const s of rec.symbols) slot.symbols.add(s);
        }
    }
    return [...map.entries()]
        .map(([issueNumber, { commits, symbols }]) => ({
            issueNumber,
            commitCount: commits,
            symbols: [...symbols].sort(),
        }))
        .sort((a, b) => b.commitCount - a.commitCount);
}

// ── Extraction symboles ───────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".js", ".svelte", ".tsx", ".jsx"]);

/**
 * Pour une liste de fichiers modifiés dans un commit, trouve les symboles
 * correspondants via la cartographie actuelle.
 */
export function findSymbolsForFiles(files: string[], root: string): string[] {
    const keys = new Set<string>();
    for (const file of files) {
        const ext = path.extname(file);
        if (!CODE_EXTS.has(ext)) continue;
        const base = path.basename(file, ext);
        const hits = searchMethods(base, root);
        for (const { key, method } of hits) {
            const normFile   = file.replace(/\\/g, "/");
            const normMethod = (method.file ?? "").replace(/\\/g, "/");
            // Accepte si le chemin de la méthode se termine par le fichier
            if (normMethod.endsWith(normFile) || normFile.endsWith(normMethod.split("/").slice(-2).join("/"))) {
                keys.add(key);
            }
        }
    }
    return [...keys];
}

// ── Coalescence historique ────────────────────────────────────────────────────

/**
 * Reconstruit la coalescence historique à partir des enregistrements de commits.
 * Réutilise le même algorithme que la coalescence sémantique, alimenté par
 * les co-modifications git plutôt que par les co-occurrences dans les issues.
 */
export function buildHistoricalCoal(records: CommitRecord[]): HistoricalCoalNode[] {
    // Index : symbole → ensemble d'indices de commits où il apparaît
    const symToCommits = new Map<string, Set<number>>();
    for (let i = 0; i < records.length; i++) {
        for (const s of records[i].symbols) {
            if (!symToCommits.has(s)) symToCommits.set(s, new Set());
            symToCommits.get(s)!.add(i);
        }
    }

    // Symboles fréquents : dans ≥ 2 commits
    const freqSyms = [...symToCommits.entries()]
        .filter(([, s]) => s.size >= 2)
        .map(([k]) => k);

    // Extension maximale — identique à clusters/+server.ts
    const coalByKey = new Map<string, { symbols: string[]; count: number }>();
    for (let i = 0; i < freqSyms.length; i++) {
        for (let j = i + 1; j < freqSyms.length; j++) {
            const ca = symToCommits.get(freqSyms[i])!;
            const cb = symToCommits.get(freqSyms[j])!;
            const common = [...ca].filter(n => cb.has(n)).sort((a, b) => a - b);
            if (common.length < 2) continue;

            const key = common.join(",");
            if (coalByKey.has(key)) continue;

            const extSyms = freqSyms
                .filter(s => common.every(n => symToCommits.get(s)?.has(n)))
                .sort();
            if (extSyms.length < 2) continue;

            coalByKey.set(key, { symbols: extSyms, count: common.length });
        }
    }

    return [...coalByKey.values()]
        .map(({ symbols, count }) => ({ symbols, count, score: symbols.length * count }))
        .sort((a, b) => b.score - a.score || b.count - a.count);
}
