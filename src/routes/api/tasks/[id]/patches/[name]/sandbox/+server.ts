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

    // Vérifier que les patches "applied" sont réellement dans le working tree.
    // git apply --check -R : réussit si le patch EST appliqué (reverse possible).
    // Échoue si absent → état périmé (revert manuel, restart, etc.) → à ré-appliquer.
    const storedApplied = getApplied(taskId);
    const already = new Set<string>();
    for (const p of storedApplied) {
        try {
            await g.raw(["apply", "--check", "-R", "--whitespace=nowarn", path.join(ctx.patchesDir, p)]);
            already.add(p); // reverse OK → patch réellement présent
        } catch {
            // Absent du working tree — état périmé, on ignore
        }
    }

    const chain = topoOrder(name, ctx.deps, already).filter(n => !already.has(n));
    if (!chain.length) return json({ ok: true, applied: [...already], chain: [] });

    const newApplied = [...already];
    const done: string[] = [];
    try {
        for (const patchName of chain) {
            await g.raw(["apply", "--whitespace=nowarn", path.join(ctx.patchesDir, patchName)]);
            newApplied.push(patchName);
            done.push(patchName);
        }
    } catch (e: any) {
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

    // Même vérification de cohérence que pour POST
    const storedApplied = getApplied(taskId);
    const verifiedApplied: string[] = [];
    for (const p of storedApplied) {
        try {
            await g.raw(["apply", "--check", "-R", "--whitespace=nowarn", path.join(ctx.patchesDir, p)]);
            verifiedApplied.push(p);
        } catch { /* absent → ignorer */ }
    }

    if (!verifiedApplied.includes(name)) {
        setApplied(taskId, verifiedApplied); // resync state
        return json({ ok: true, applied: verifiedApplied });
    }

    // Retirer les dépendants en premier (ordre inverse d'application), puis le patch lui-même
    const dependents = findDependents(name, verifiedApplied, ctx.deps)
        .sort((a, b) => verifiedApplied.indexOf(b) - verifiedApplied.indexOf(a));
    const toRemove = [...dependents, name];

    const newApplied = [...verifiedApplied];
    for (const patchName of toRemove) {
        await g.raw(["apply", "-R", "--whitespace=nowarn", path.join(ctx.patchesDir, patchName)]);
        const idx = newApplied.indexOf(patchName);
        if (idx !== -1) newApplied.splice(idx, 1);
    }

    setApplied(taskId, newApplied);
    return json({ ok: true, applied: newApplied, removed: toRemove });
};
