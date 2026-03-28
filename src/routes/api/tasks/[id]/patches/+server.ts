import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listPatches, listPatchesFrom } from "$lib/server/services/patches";
import { findTaskGlobal } from "$lib/server/services/tasks";

export const GET: RequestHandler = async ({ params }) => {
    // Cherche la task dans tous les projets pour trouver le bon tasksDir (cross-projet)
    const found = findTaskGlobal(t => t.id === params.id);
    if (found) return json(listPatchesFrom(found.tasksDir, params.id));
    return json(listPatches(params.id));
};
