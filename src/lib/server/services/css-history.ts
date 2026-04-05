/** CSS History — trace la dernière action d'audit CSS effectuée */
import fs from "fs";

const HISTORY_FILE = ".agent/css-history.json";
const ANALYSIS_FILE = ".agent/css-analysis.md";

export type CssHistoryEntry = {
    date: string;       // ISO timestamp
    taskTitle: string;
    prUrl: string;      // https://github.com/owner/repo/pull/N
    commitUrl: string;  // https://github.com/owner/repo/commit/SHA
    branch: string;
};

export function saveCssHistory(entry: CssHistoryEntry): void {
    fs.mkdirSync(".agent", { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(entry, null, 2), "utf-8");
}

export function loadCssHistory(): CssHistoryEntry | null {
    if (!fs.existsSync(HISTORY_FILE)) return null;
    try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8")); }
    catch { return null; }
}

/** Supprime l'analyse en cours (reset du tab CSS) */
export function deleteCssAnalysis(): void {
    if (fs.existsSync(ANALYSIS_FILE)) fs.unlinkSync(ANALYSIS_FILE);
}
