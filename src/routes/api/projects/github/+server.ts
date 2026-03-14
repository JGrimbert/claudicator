/** Projets — liste les dépôts GitHub accessibles (GET) */
import { json } from "@sveltejs/kit";
import { listAccessibleRepos } from "$lib/server/services/github";
import { listProjects } from "$lib/server/services/projects";

/** Liste les repos GitHub accessibles avec statut configuré */
export async function GET() {
    try {
        const repos = await listAccessibleRepos();
        const { projects } = listProjects();
        // Marque les repos déjà configurés localement
        const configured = new Set(projects.map(p => p.repo).filter(Boolean));
        return json(repos.map(r => ({ ...r, configured: configured.has(r.name) })));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, { status: 500 });
    }
}
