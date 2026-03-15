import { json } from "@sveltejs/kit";
import { getSnippet } from "$lib/server/services/cartography";
import { getProjectRoot } from "$lib/server/services/projects";

export async function GET({ url }) {
    const key = url.searchParams.get("key");
    if (!key) return json({ error: "Missing key" }, { status: 400 });
    const root = getProjectRoot();
    const snippet = getSnippet(key, root);
    if (!snippet) return json({ error: "Not found" }, { status: 404 });
    return json({ key, snippet });
}
