import { json } from "@sveltejs/kit";
import { getProjectRoot } from "$lib/server/services/projects";
import { refreshIndex } from "$lib/server/services/cartography";

/** Rafraîchit l'index du projet cible */
export async function POST({ request }) {
    const body = await request.json().catch(() => ({}));
    const root = (body.projectRoot ?? "").trim() || getProjectRoot();

    try {
        const result = refreshIndex(root);
        return json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, { status: 500 });
    }
}
