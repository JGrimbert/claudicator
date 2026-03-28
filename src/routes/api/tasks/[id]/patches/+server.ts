import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listPatches, listPatchesFrom, getAbsPatchesDir, getAbsPatchesDirFrom, checkPatchStale } from "$lib/server/services/patches";
import { findTaskGlobal } from "$lib/server/services/tasks";

export const GET: RequestHandler = async ({ params, url }) => {
    const withCheck = url.searchParams.has("check");
    const found = findTaskGlobal(t => t.id === params.id);
    const patches = found
        ? listPatchesFrom(found.tasksDir, params.id)
        : listPatches(params.id);
    if (!withCheck) return json(patches);

    const patchesDir = found
        ? getAbsPatchesDirFrom(found.tasksDir, params.id)
        : getAbsPatchesDir(params.id);
    await Promise.all(patches.map(async p => {
        p.stale = await checkPatchStale(patchesDir, p.name);
    }));
    return json(patches);
};
