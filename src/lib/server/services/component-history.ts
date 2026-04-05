/** Component History — trace la dernière action d'audit composants */
import fs from "fs";

const HISTORY_FILE = ".agent/component-history.json";
const ANALYSIS_FILE = ".agent/component-analysis.md";

export type ComponentHistoryEntry = {
    date: string;
    taskTitle: string;
    prUrl: string;
    commitUrl: string;
    branch: string;
};

export function saveComponentHistory(entry: ComponentHistoryEntry): void {
    fs.mkdirSync(".agent", { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(entry, null, 2), "utf-8");
}

export function loadComponentHistory(): ComponentHistoryEntry | null {
    if (!fs.existsSync(HISTORY_FILE)) return null;
    try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8")); }
    catch { return null; }
}

export function deleteComponentAnalysis(): void {
    if (fs.existsSync(ANALYSIS_FILE)) fs.unlinkSync(ANALYSIS_FILE);
}
