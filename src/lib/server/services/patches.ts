import fs from "fs";
import path from "path";
import simpleGit from "simple-git";
import { getTasksDir } from "./tasks";
import { getProjectRoot } from "./projects";

export type PatchInfo = {
    name: string;
    issueNumber?: number;
    hasTests: boolean;
    createdAt: number;
};

export function getPatchesDir(taskId: string): string {
    return path.join(getTasksDir(), taskId, "patches");
}

export function getAbsPatchesDir(taskId: string): string {
    return path.resolve(getPatchesDir(taskId));
}

function detectTests(content: string): boolean {
    return /\+\+\+ b\/.*\.(test|spec)\.(ts|js|tsx|jsx|vue)/.test(content);
}

export function listPatches(taskId: string): PatchInfo[] {
    const dir = getPatchesDir(taskId);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => f.endsWith(".patch"))
        .map(name => {
            const filePath = path.join(dir, name);
            const content = fs.readFileSync(filePath, "utf-8");
            const stat = fs.statSync(filePath);
            const m = name.match(/issue-(\d+)/);
            return {
                name,
                issueNumber: m ? Number(m[1]) : undefined,
                hasTests: detectTests(content),
                createdAt: stat.mtimeMs,
            };
        })
        .sort((a, b) => (a.issueNumber ?? 0) - (b.issueNumber ?? 0));
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

export async function applyPatch(taskId: string, name: string): Promise<void> {
    const filePath = path.resolve(getPatchesDir(taskId), name);
    const root = getProjectRoot();
    const g = simpleGit(root);
    await g.raw(["apply", "--whitespace=nowarn", filePath]);
}

export function deletePatch(taskId: string, name: string): void {
    const filePath = path.join(getPatchesDir(taskId), name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
