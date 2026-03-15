/** Skills — retourne les proposals sauvegardées (GET) */
import { json }          from "@sveltejs/kit";
import { loadProposals } from "$lib/server/services/skill-proposals";

export async function GET() {
    return json(loadProposals());
}
