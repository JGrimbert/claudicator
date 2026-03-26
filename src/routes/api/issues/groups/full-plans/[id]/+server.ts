import type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";
import fs from "fs";
import path from "path";
import { getFullPlan, getFullPlanDir } from "$lib/server/services/fullPlans";

/** GET /api/issues/groups/full-plans/[id] — retourne un plan complet par son identifiant */
export const GET: RequestHandler = async ({ params }) => {
    const plan = getFullPlan(params.id);
    if (!plan) throw error(404, "Plan complet introuvable");
    return json(plan);
};

/** DELETE /api/issues/groups/full-plans/[id] — supprime le fullplan (JSON + dossier atlas/patches) */
export const DELETE: RequestHandler = async ({ params }) => {
    const planFile = `.agent/full-plans/${params.id}.json`;
    if (fs.existsSync(planFile)) fs.unlinkSync(planFile);
    const planDir = getFullPlanDir(params.id);
    if (fs.existsSync(planDir)) fs.rmSync(planDir, { recursive: true, force: true });
    return new Response(null, { status: 204 });
};
