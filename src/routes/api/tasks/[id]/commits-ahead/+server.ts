import { json } from "@sveltejs/kit";
import { resolveTaskContext } from "$lib/server/services/tasks";
import { getCommitsAhead } from "$lib/server/services/git";

export async function GET({ params }) {
    const ctx = resolveTaskContext(params.id);
    if (!ctx) return json({ error: "Task introuvable" }, { status: 404 });
    const { task, projectRoot: root } = ctx;
    if (!task.branch) return json({ count: 0, commits: [] });
    try {
        const result = await getCommitsAhead(root, task.branch);
        return json(result);
    } catch {
        return json({ count: 0, commits: [] });
    }
}
