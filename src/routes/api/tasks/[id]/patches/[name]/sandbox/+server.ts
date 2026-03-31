import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listPatchesFrom, listPatches, getPatchContentFrom, getPatchContent } from "$lib/server/services/patches";
import { findTaskGlobal } from "$lib/server/services/tasks";
import { getPatchFiles, buildDeps, getApplied, setApplied } from "$lib/server/services/patchState";
import { getProjectRoot } from "$lib/server/services/projects";
import simpleGit from "simple-git";
import path from "path";

type PatchCtx = { deps: Record<string, string[]>; patchesDir: string };

async function getContext(taskId: string): Promise<PatchCtx | null> {
    const found = findTaskGlobal(t => t.id === taskId);
    if (!found) return null;
    // Trier par createdAt : ordre réel de génération (pas par numéro d'issue)
    const patches = listPatchesFrom(found.tasksDir, taskId)
        .sort((a, b) => a.createdAt - b.createdAt);
    const patchesWithFiles = patches.map(p => ({
        name: p.name,
        files: getPatchFiles(getPatchContentFrom(found.tasksDir, taskId, p.name) ?? ""),
    }));
    return {
        deps: buildDeps(patchesWithFiles),
        patchesDir: path.resolve(found.tasksDir, taskId, "patches"),
    };
}

/** Ordre topologique : dépendances d'abord, puis le patch lui-même. */
function topoOrder(start: string, deps: Record<string, string[]>, exclude: Set<string>): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    function visit(name: string) {
        if (visited.has(name)) return;
        visited.add(name);
        for (const dep of (deps[name] ?? [])) {
            if (!exclude.has(dep)) visit(dep);
        }
        result.push(name);
    }
    visit(start);
    return result;
}

/** Trouve tous les patches appliqués qui dépendent (directement ou transitivement) de `name`. */
function findDependents(name: string, applied: string[], deps: Record<string, string[]>): string[] {
    const rev: Record<string, string[]> = {};
    for (const [b, as] of Object.entries(deps)) {
        for (const a of as) { (rev[a] ??= []).push(b); }
    }
    const result: string[] = [];
    const visited = new Set<string>();
    function visit(n: string) {
        if (visited.has(n)) return;
        visited.add(n);
        for (const dep of (rev[n] ?? [])) {
            if (applied.includes(dep)) { result.push(dep); visit(dep); }
        }
    }
    visit(name);
    return result;
}

/** POST — applique le patch (+ dépendances manquantes) dans le repo cible. */
export const POST: RequestHandler = async ({ params }) => {
    const { id: taskId, name } = params;
    const root = getProjectRoot();
    const g = simpleGit(root);

    if (!(await g.status()).isClean()) return json({ error: "dirty" }, { status: 409 });

    const ctx = await getContext(taskId);
    if (!ctx) throw error(404, "Task introuvable");

    const applied = getApplied(taskId);
    const already = new Set(applied);
    const chain = topoOrder(name, ctx.deps, already).filter(n => !already.has(n));
    if (!chain.length) return json({ ok: true, applied, chain: [] });

    const newApplied = [...applied];
    const done: string[] = [];
    try {
        for (const patchName of chain) {
            await g.raw(["apply", "--whitespace=nowarn", path.join(ctx.patchesDir, patchName)]);
            newApplied.push(patchName);
            done.push(patchName);
        }
    } catch (e: any) {
        // Rollback des patches appliqués dans cette session
        for (const patchName of [...done].reverse()) {
            try { await g.raw(["apply", "-R", "--whitespace=nowarn", path.join(ctx.patchesDir, patchName)]); } catch { /* ignore */ }
        }
        throw error(500, `git apply échoué : ${e.message}`);
    }

    setApplied(taskId, newApplied);
    return json({ ok: true, applied: newApplied, chain });
};

/** DELETE — retire le patch (+ dépendants appliqués) du repo cible. */
export const DELETE: RequestHandler = async ({ params }) => {
    const { id: taskId, name } = params;
    const root = getProjectRoot();
    const g = simpleGit(root);

    if (!(await g.status()).isClean()) return json({ error: "dirty" }, { status: 409 });

    const ctx = await getContext(taskId);
    if (!ctx) throw error(404, "Task introuvable");

    const applied = getApplied(taskId);
    if (!applied.includes(name)) return json({ ok: true, applied });

    // Retirer les dépendants en premier (ordre inverse d'application), puis le patch lui-même
    const dependents = findDependents(name, applied, ctx.deps)
        .sort((a, b) => applied.indexOf(b) - applied.indexOf(a));
    const toRemove = [...dependents, name];

    const newApplied = [...applied];
    for (const patchName of toRemove) {
        await g.raw(["apply", "-R", "--whitespace=nowarn", path.join(ctx.patchesDir, patchName)]);
        const idx = newApplied.indexOf(patchName);
        if (idx !== -1) newApplied.splice(idx, 1);
    }

    setApplied(taskId, newApplied);
    return json({ ok: true, applied: newApplied, removed: toRemove });
};
