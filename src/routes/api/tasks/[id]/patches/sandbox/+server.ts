import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listPatchesFrom, listPatches, getPatchContentFrom, getPatchContent } from "$lib/server/services/patches";
import { findTaskGlobal } from "$lib/server/services/tasks";
import { getPatchFiles, buildDeps, getApplied } from "$lib/server/services/patchState";
import { getProjectRoot } from "$lib/server/services/projects";
import simpleGit from "simple-git";

/** GET /api/tasks/[id]/patches/sandbox
 *  Retourne : applied[], deps{}, clean (git status du projet cible) */
export const GET: RequestHandler = async ({ params }) => {
    const taskId = params.id;
    const found = findTaskGlobal(t => t.id === taskId);
    const patches = (found ? listPatchesFrom(found.tasksDir, taskId) : listPatches(taskId))
        .sort((a, b) => a.createdAt - b.createdAt); // ordre réel de génération

    const patchesWithFiles = patches.map(p => ({
        name: p.name,
        files: getPatchFiles(
            found
                ? (getPatchContentFrom(found.tasksDir, taskId, p.name) ?? "")
                : (getPatchContent(taskId, p.name) ?? "")
        ),
    }));

    const deps = buildDeps(patchesWithFiles);
    const applied = getApplied(taskId);
    const status = await simpleGit(getProjectRoot()).status();

    return json({ applied, deps, clean: status.isClean() });
};
