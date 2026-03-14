/** Config — lit ou met à jour la configuration du projet (GET, PATCH) */
import { json } from "@sveltejs/kit";
import {
    getProjectConfig,
    setProjectConfig,
    GLOBAL_IGNORE_DIRS,
} from "$lib/server/services/project-config";

/** Retourne la configuration projet courante */
export async function GET() {
    return json({ ...getProjectConfig(), globalIgnoreDirs: GLOBAL_IGNORE_DIRS });
}

/** Met à jour la configuration projet */
export async function PATCH({ request }) {
    try {
        const body = await request.json();
        const updated = setProjectConfig(body);
        return json(updated);
    } catch (err: any) {
        return json({ error: err.message }, { status: 400 });
    }
}
