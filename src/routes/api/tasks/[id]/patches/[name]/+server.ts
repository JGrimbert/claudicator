import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getPatchContent, deletePatch } from "$lib/server/services/patches";

export const GET: RequestHandler = async ({ params }) => {
    const content = getPatchContent(params.id, params.name);
    if (content === null) throw error(404, "Patch introuvable");
    return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};

export const DELETE: RequestHandler = async ({ params }) => {
    deletePatch(params.id, params.name);
    return new Response(null, { status: 204 });
};
