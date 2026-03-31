import fs from "fs";
import path from "path";
import simpleGit from "simple-git";
import { getTasksDir } from "./tasks";
import { getProjectRoot } from "./projects";

export type PatchInfo = {
    name: string;
    issueNumber?: number;       // premier numéro (compat)
    issueNumbers?: number[];    // tous les numéros (multi-issue)
    hasTests: boolean;
    isPureUI: boolean;          // patch ne contient que des fichiers .svelte/.css/.scss
    createdAt: number;
    durationMs?: number;        // temps écoulé depuis le début du run (ou fin du patch précédent)
    stale?: boolean;
};

export function getPatchesDir(taskId: string): string {
    return path.join(getTasksDir(), taskId, "patches");
}

export function getAbsPatchesDir(taskId: string): string {
    return path.resolve(getPatchesDir(taskId));
}

/** Variante cross-projet : calcule le chemin absolu à partir du répertoire tasks réel de la task. */
export function getAbsPatchesDirFrom(tasksDir: string, taskId: string): string {
    return path.resolve(tasksDir, taskId, "patches");
}

/** Lit le contenu d'un patch à partir du répertoire tasks réel de la task. */
export function getPatchContentFrom(tasksDir: string, taskId: string, name: string): string | null {
    const filePath = path.join(tasksDir, taskId, "patches", name);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8");
}

/** Extrait la date de commit depuis l'en-tête git format-patch.
 *  Ex: "Date: Thu, 31 Mar 2026 10:30:00 +0200" → timestamp ms.
 *  Plus fiable que mtimeMs : immuable, même si le fichier est réécrit (write-tests, copie...). */
function extractCommitDate(content: string): number | null {
    const m = content.match(/^Date:\s+(.+)$/m);
    if (!m) return null;
    const t = new Date(m[1].trim()).getTime();
    return isNaN(t) ? null : t;
}

function detectTests(content: string): boolean {
    return /\+\+\+ b\/.*\.(test|spec)\.(ts|js|tsx|jsx|vue)/.test(content);
}

/** Retourne true si le patch ne touche que des fichiers UI (.svelte, .css, .scss).
 *  Ces fichiers n'ont pas besoin de tests unitaires. */
function detectPureUI(content: string): boolean {
    const files = [...content.matchAll(/^\+\+\+ b\/(.+)$/gm)].map(m => m[1].trim());
    if (files.length === 0) return false;
    return files.every(f => /\.(svelte|css|scss)$/.test(f));
}

/** Variante cross-projet : liste les patches depuis le répertoire tasks réel de la task. */
export function listPatchesFrom(tasksDir: string, taskId: string): PatchInfo[] {
    const dir = path.join(tasksDir, taskId, "patches");
    return _listPatchesFromDir(dir);
}

function _listPatchesFromDir(dir: string): PatchInfo[] {
    if (!fs.existsSync(dir)) return [];

    // Timestamp de départ du run (pour calculer la durée de la première étape)
    let runStartedAt: number | null = null;
    try {
        const t = JSON.parse(fs.readFileSync(path.join(dir, "run-started-at.json"), "utf-8"));
        runStartedAt = typeof t.startedAt === "number" ? t.startedAt : null;
    } catch { /* absent */ }

    const patches = fs.readdirSync(dir)
        .filter(f => f.endsWith(".patch"))
        .map(name => {
            const filePath = path.join(dir, name);
            const content = fs.readFileSync(filePath, "utf-8");
            const stat = fs.statSync(filePath);
            const stem = name.replace(/\.patch$/, "");
            const afterIssue = stem.match(/^issue-(.+)$/);
            const issueNumbers = afterIssue
                ? afterIssue[1].split("-").map(Number).filter(n => Number.isFinite(n) && n > 0)
                : undefined;
            return {
                name,
                issueNumber: issueNumbers?.[0],
                issueNumbers,
                hasTests: detectTests(content),
                isPureUI: detectPureUI(content),
                // Date de commit embarquée dans le patch — immuable même si le fichier est réécrit.
                // Fallback sur mtimeMs si le header est absent (patches manuels / anciens formats).
                createdAt: extractCommitDate(content) ?? stat.mtimeMs,
            } satisfies Omit<PatchInfo, "durationMs">;
        });

    // Calcul des durées : trié par date de création (ordre d'implémentation)
    const sorted = [...patches].sort((a, b) => a.createdAt - b.createdAt);
    const durationsMap = new Map<string, number>();
    sorted.forEach((p, i) => {
        const prevTime = i === 0 ? runStartedAt : sorted[i - 1].createdAt;
        if (prevTime !== null) durationsMap.set(p.name, p.createdAt - prevTime);
    });

    return patches
        .map(p => ({ ...p, durationMs: durationsMap.get(p.name) }))
        .sort((a, b) => (a.issueNumber ?? 0) - (b.issueNumber ?? 0));
}

export function listPatches(taskId: string): PatchInfo[] {
    return _listPatchesFromDir(getPatchesDir(taskId));
}

export function hasPatchFiles(taskId: string): boolean {
    const dir = getPatchesDir(taskId);
    if (!fs.existsSync(dir)) return false;
    return fs.readdirSync(dir).some(f => f.endsWith(".patch"));
}

export function getPatchContent(taskId: string, name: string): string | null {
    const filePath = path.join(getPatchesDir(taskId), name);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8");
}

/** Vérifie si un patch isolé peut s'appliquer sans modifier les fichiers. */
export async function checkPatchStale(patchesDir: string, name: string): Promise<boolean> {
    const filePath = path.resolve(patchesDir, name);
    const root = getProjectRoot();
    const g = simpleGit(root);
    try {
        await g.raw(["apply", "--check", "--whitespace=nowarn", filePath]);
        return false;
    } catch {
        return true;
    }
}

/**
 * Vérifie la staleness d'une série de patches en appliquant chacun
 * séquentiellement dans un worktree temporaire isolé.
 *
 * Principe : un patch est périmé uniquement s'il entre en conflit avec
 * le repo ACTUEL (HEAD) une fois tous les patches précédents appliqués —
 * pas à cause d'un commit antérieur à la génération.
 *
 * Retourne un Map<name, stale>.
 */
export async function checkPatchesStale(
    patchesDir: string,
    patches: PatchInfo[]
): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>(patches.map(p => [p.name, false]));
    if (!patches.length) return result;

    const root = getProjectRoot();
    const g = simpleGit(root);

    // Tri par date de création — ordre de génération dans le worktree source
    const sorted = [...patches].sort((a, b) => a.createdAt - b.createdAt);

    // Worktree temporaire isolé : copie propre depuis HEAD
    const worktreesBase = path.join(process.cwd(), ".agent", "worktrees");
    fs.mkdirSync(worktreesBase, { recursive: true });
    const tmpPath = path.join(worktreesBase, `stale-check-${Date.now()}`);

    try {
        await g.raw(["worktree", "add", "--detach", tmpPath, "HEAD"]);
        const gTmp = simpleGit(tmpPath);

        for (const p of sorted) {
            const filePath = path.resolve(patchesDir, p.name);
            const idx = sorted.indexOf(p);
            try {
                // Application réelle dans le worktree tmp → contexte maintenu pour le patch suivant
                await gTmp.raw(["apply", "--whitespace=nowarn", filePath]);
            } catch {
                // Ce patch ne s'applique pas au-dessus des précédents → lui et la suite sont périmés
                for (let i = idx; i < sorted.length; i++) {
                    result.set(sorted[i].name, true);
                }
                break;
            }
        }
    } finally {
        try { await g.raw(["worktree", "remove", "--force", tmpPath]); } catch { /* best-effort */ }
    }

    return result;
}

export async function applyPatch(taskId: string, name: string): Promise<void> {
    const filePath = path.resolve(getPatchesDir(taskId), name);
    const root = getProjectRoot();
    const g = simpleGit(root);
    try {
        await g.raw(["apply", "--whitespace=nowarn", filePath]);
        return;
    } catch { /* essai suivant */ }
    try {
        // Contexte légèrement décalé : merge 3-voies via l'index git.
        await g.raw(["apply", "--3way", "--whitespace=nowarn", filePath]);
        return;
    } catch { /* essai suivant */ }
    // Contexte trop stale (code refactorisé depuis la génération du patch).
    // On applique ce qui peut l'être et on crée des .rej pour les hunks en échec.
    // L'erreur indique quels fichiers .rej ont été générés.
    await g.raw(["apply", "--reject", "--whitespace=nowarn", filePath]);
}

export function deletePatch(taskId: string, name: string): void {
    const filePath = path.join(getPatchesDir(taskId), name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export function deletePatchFrom(tasksDir: string, taskId: string, name: string): void {
    const filePath = path.join(tasksDir, taskId, "patches", name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
