import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getFullPlan, getFullPlanDir } from "$lib/server/services/fullPlans";
import fs from "fs";
import path from "path";

export const GET: RequestHandler = async ({ params }) => {
    const { id, stepfile } = params;
    // Sécurité : uniquement des .md sans traversal
    if (!stepfile.endsWith(".md") || stepfile.includes("/") || stepfile.includes("..") || stepfile.includes("\\")) {
        throw error(400, "Nom de fichier invalide");
    }
    const plan = getFullPlan(id);
    if (!plan) throw error(404, "Plan introuvable");
    const filePath = path.join(getFullPlanDir(id), stepfile);
    if (!fs.existsSync(filePath)) throw error(404, "Fichier d'étape introuvable");
    const content = fs.readFileSync(filePath, "utf-8");
    return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
