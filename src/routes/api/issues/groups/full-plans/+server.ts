import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import { listFullPlans } from "$lib/server/services/fullPlans";

/** GET /api/issues/groups/full-plans — retourne tous les plans complets triés par date */
export const GET: RequestHandler = async () => {
    return json(listFullPlans());
};
