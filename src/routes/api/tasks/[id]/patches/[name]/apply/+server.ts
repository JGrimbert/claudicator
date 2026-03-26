import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { applyPatch } from "$lib/server/services/patches";

export const POST: RequestHandler = async ({ params }) => {
    try {
        await applyPatch(params.id, params.name);
        return json({ ok: true });
    } catch (e: any) {
        throw error(500, e.message);
    }
};
