import { json } from "@sveltejs/kit";
import { listProjects, addProject } from "$lib/server/services/projects";

/** Liste tous les projets */
export async function GET() {
    return json(listProjects());
}

/** Ajoute un projet par chemin */
export async function POST({ request }) {
    const body = await request.json();
    const projectPath: string = body.path?.trim();
    if (!projectPath) return json({ error: "Chemin requis" }, { status: 400 });
    try {
        const project = await addProject(projectPath);
        return json(project);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, { status: 500 });
    }
}
