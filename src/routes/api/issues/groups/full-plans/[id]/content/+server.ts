import type { RequestHandler } from "./$types";
import { error, json } from "@sveltejs/kit";
import fs from "fs";
import path from "path";
import { getFullPlan } from "$lib/server/services/fullPlans";
import { getTasksDir } from "$lib/server/services/tasks";

/** GET /api/issues/groups/full-plans/[id]/content — retourne le texte brut du plan */
export const GET: RequestHandler = async ({ params }) => {
    const plan = getFullPlan(params.id);
    if (!plan || !plan.planFile) throw error(404, "Plan non trouvé");
    const filePath = path.join(getTasksDir(), plan.planFile);
    if (!fs.existsSync(filePath)) throw error(404, "Fichier plan introuvable");
    const content = fs.readFileSync(filePath, "utf-8");
    return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};

/** PATCH /api/issues/groups/full-plans/[id]/content — sauvegarde le contenu édité */
export const PATCH: RequestHandler = async ({ params, request }) => {
    const plan = getFullPlan(params.id);
    if (!plan?.planFile) throw error(404, "Plan introuvable");
    const { content } = await request.json() as { content: string };
    const filePath = path.join(getTasksDir(), plan.planFile);
    fs.writeFileSync(filePath, content, "utf-8");
    return json({ ok: true });
};
