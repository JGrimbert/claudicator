import { json } from "@sveltejs/kit";
import { getCurrentProject } from "$lib/server/services/projects";
import { getRepoFile } from "$lib/server/services/github";



export async function GET({ url }) {
    const path = url.searchParams.get("path");
    if (!path) return json({ error: "path manquant" }, { status: 400 });

    const owner = getCurrentProject()?.owner ?? "";
    const repo = getCurrentProject()?.repo ?? "";

    try {
        const content = await getRepoFile(owner, repo, path);
        return json({ content });
    } catch (err: any) {
        return json({ error: err.message }, { status: 404 });
    }
}
