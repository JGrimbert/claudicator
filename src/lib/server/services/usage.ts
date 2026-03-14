import fs from "fs";
import path from "path";

type ProjectUsage = {
    totalInputTokens: number;
    totalOutputTokens: number;
    lastUpdated: string;
};

const USAGE_FILE = path.join(".agent", "usage.json");

/** Charge l'usage depuis le fichier JSON */
function loadUsage(): ProjectUsage {
    try {
        if (fs.existsSync(USAGE_FILE)) {
            return JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
        }
    } catch { /* silencieux */ }
    return { totalInputTokens: 0, totalOutputTokens: 0, lastUpdated: new Date().toISOString() };
}

/** Retourne l'usage actuel du projet */
export function getProjectUsage(): ProjectUsage {
    return loadUsage();
}

/** Incrémente et sauvegarde les tokens utilisés */
export function addProjectUsage(input: number, output: number): void {
    const current = loadUsage();
    const updated: ProjectUsage = {
        totalInputTokens: current.totalInputTokens + input,
        totalOutputTokens: current.totalOutputTokens + output,
        lastUpdated: new Date().toISOString(),
    };
    try {
        fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
        fs.writeFileSync(USAGE_FILE, JSON.stringify(updated, null, 2), "utf-8");
    } catch { /* silencieux */ }
}
