/** Atlas — retourne le registre des compétences (GET) */
import { json } from "@sveltejs/kit";
import { SKILL_REGISTRY } from "$lib/server/agent/skills";

/** Retourne le registre complet des skills disponibles. */
export async function GET() {
    return json(SKILL_REGISTRY);
}
