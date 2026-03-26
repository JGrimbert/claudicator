import type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";
import { getFullPlan } from "$lib/server/services/fullPlans";

/** GET /api/issues/groups/full-plans/[id] — retourne un plan complet par son identifiant */
export const GET: RequestHandler = async ({ params }) => {
    const plan = getFullPlan(params.id);
    if (!plan) throw error(404, "Plan complet introuvable");
    return json(plan);
};
