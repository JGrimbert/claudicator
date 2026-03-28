import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getPatchContent, getPatchContentFrom, deletePatch, deletePatchFrom } from "$lib/server/services/patches";
import { findTaskGlobal } from "$lib/server/services/tasks";

export const GET: RequestHandler = async ({ params }) => {
    const found = findTaskGlobal(t => t.id === params.id);
    const content = found
        ? getPatchContentFrom(found.tasksDir, params.id, params.name)
        : getPatchContent(params.id, params.name);
    if (content === null) throw error(404, "Patch introuvable");
    return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};

export const DELETE: RequestHandler = async ({ params }) => {
    const found = findTaskGlobal(t => t.id === params.id);
    if (found) deletePatchFrom(found.tasksDir, params.id, params.name);
    else deletePatch(params.id, params.name);
    return new Response(null, { status: 204 });
};
