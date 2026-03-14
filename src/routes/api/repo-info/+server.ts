import { json } from "@sveltejs/kit";
import { getCurrentProject } from "$lib/server/services/projects";

/** Retourne le projet courant (owner, repo, path) */
export function GET() {
    const p = getCurrentProject();
    return json({ owner: p?.owner ?? "", repo: p?.repo ?? "", path: p?.path ?? "" });
}
