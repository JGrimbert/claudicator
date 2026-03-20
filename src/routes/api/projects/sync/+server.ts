/** Projets — synchronise les installationId GitHub App pour tous les projets (POST) */
import { json } from "@sveltejs/kit";
import { listProjects, updateProject } from "$lib/server/services/projects";
import { findInstallationForRepo } from "$lib/server/services/github";

/** Détecte et enregistre l'installationId pour chaque projet configuré */
export async function POST() {
    const { projects } = listProjects();
    const results: Array<{ id: string; name: string; installationId: number | null }> = [];

    for (const project of projects) {
        if (!project.owner || !project.repo) continue;
        const installationId = await findInstallationForRepo(project.owner, project.repo);
        if (installationId) {
            updateProject(project.id, { installationId: String(installationId) });
        }
        results.push({ id: project.id, name: project.name, installationId });
    }

    return json({ synced: results });
}
