/** Sandbox patches — analyse de dépendances et état d'application */
import fs from "fs";
import path from "path";

/** Extrait les fichiers touchés par un patch (lignes `+++ b/...`) */
export function getPatchFiles(content: string): string[] {
    const files: string[] = [];
    for (const line of content.split("\n")) {
        if (line.startsWith("+++ b/")) files.push(line.slice(6).trim());
    }
    return [...new Set(files)];
}

/** Construit le graphe de dépendances entre patches.
 *  deps[B] = [A] signifie que B nécessite A (overlap de fichiers).
 *  Le tableau doit être pré-trié dans l'ordre d'implémentation réel (par createdAt). */
export function buildDeps(patches: { name: string; files: string[] }[]): Record<string, string[]> {
    const deps: Record<string, string[]> = {};
    for (const p of patches) deps[p.name] = [];

    for (let i = 0; i < patches.length; i++) {
        for (let j = i + 1; j < patches.length; j++) {
            const a = patches[i], b = patches[j];
            if (a.files.some(f => b.files.includes(f))) {
                deps[b.name].push(a.name);
            }
        }
    }
    return deps;
}

const SANDBOX_DIR = path.join(".agent", "patch-sandbox");

function stateFile(taskId: string): string {
    return path.join(SANDBOX_DIR, `${taskId}.json`);
}

export function getApplied(taskId: string): string[] {
    const f = stateFile(taskId);
    if (!fs.existsSync(f)) return [];
    try { return JSON.parse(fs.readFileSync(f, "utf-8")).applied ?? []; } catch { return []; }
}

export function setApplied(taskId: string, applied: string[]): void {
    fs.mkdirSync(SANDBOX_DIR, { recursive: true });
    fs.writeFileSync(stateFile(taskId), JSON.stringify({ applied }, null, 2));
}
