/** Projets — liste les projets ou en ajoute un (GET, POST) */
import { json } from "@sveltejs/kit";
import { listProjects, addProject, updateProject } from "$lib/server/services/projects";
import { findInstallationForRepo } from "$lib/server/services/github";

/** Liste tous les projets */
export async function GET() {
    return json(listProjects());
}

/** Ajoute un projet par chemin (auto-détecte l'installationId GitHub App) */
export async function POST({ request }) {
    const body = await request.json();
    const projectPath: string = body.path?.trim();
    if (!projectPath) return json({ error: "Chemin requis" }, { status: 400 });
    try {
        const project = await addProject(projectPath);
        if (project.owner && project.repo) {
            const installationId = await findInstallationForRepo(project.owner, project.repo);
            if (installationId) {
                updateProject(project.id, { installationId: String(installationId) });
                project.installationId = String(installationId);
            }
        }
        return json(project);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, { status: 500 });
    }
}
