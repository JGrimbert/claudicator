import { json } from "@sveltejs/kit";
import { getProjectRoot } from "$lib/server/services/projects";
import { scanGodObjects, loadGodObjects } from "$lib/server/services/god-objects";

/** Retourne le dernier scan sauvegardé (null si aucun) */
export async function GET() {
    return json(loadGodObjects());
}

/** Lance un nouveau scan sur le projet actif et sauvegarde le résultat */
export async function POST({ request }) {
    const body = await request.json().catch(() => ({}));
    const root = getProjectRoot();
    const scan = scanGodObjects(root, body.thresholds);
    return json(scan);
}
