import { json } from "@sveltejs/kit";
import { getTask, updateTask } from "$lib/server/services/tasks";
import { getBranchState } from "$lib/server/services/git";
import { getProjectRoot } from "$lib/server/services/projects";

export async function POST({ params }) {
    const task = getTask(params.id);
    if (!task) return json({ error: "Task introuvable" }, { status: 404 });
    if (!task.branch) return json(task);

    const root = getProjectRoot();

    try {
        const { pushed, merged } = await getBranchState(root, task.branch);

        const patch: Parameters<typeof updateTask>[1] = {};
        if (pushed && !task.pushed) patch.pushed = true;
        if (merged && task.status !== "merged") patch.status = "merged";

        if (Object.keys(patch).length > 0) {
            return json(updateTask(params.id, patch));
        }
        return json(task);
    } catch {
        return json(task);
    }
}
