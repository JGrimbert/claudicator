import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listPatches } from "$lib/server/services/patches";

export const GET: RequestHandler = async ({ params }) => {
    return json(listPatches(params.id));
};
