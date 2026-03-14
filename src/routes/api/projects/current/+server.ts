/** Projets — définit ou supprime le projet courant (PATCH, DELETE) */
import { json } from "@sveltejs/kit";
import { setCurrentProject, getCurrentProject, removeProject, listProjects } from "$lib/server/services/projects";

/** Définit le projet courant par ID */
export async function PATCH({ request }) {
    const { id } = await request.json();
    if (!setCurrentProject(id)) return json({ error: "Projet introuvable" }, { status: 404 });
    return json(getCurrentProject());
}

/** Supprime un projet et retourne la liste */
export async function DELETE({ request }) {
    const { id } = await request.json();
    removeProject(id);
    return json(listProjects());
}
