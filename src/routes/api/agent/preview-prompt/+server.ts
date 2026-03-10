import { getTask } from "$lib/server/services/tasks";
import { getProjectRoot } from "$lib/server/services/projects";
import { loadSymbolMap, loadMethodSnippets } from "$lib/server/agent/context";
import { formatImplementationPrompt, loadProjectDocs } from "$lib/server/agent/prompt";

export async function POST({ request }) {
    const body = await request.json();
    const { plan, taskId, projectRoot } = body;
    const root = projectRoot?.trim() || getProjectRoot();

    if (!plan?.trim() || !taskId) {
        return new Response(JSON.stringify({ error: "plan et taskId requis" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    const task = getTask(taskId);
    if (!task) {
        return new Response(JSON.stringify({ error: "Task introuvable" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
        });
    }

    const symbolMap = loadSymbolMap(root, task.title);
    const methods = loadMethodSnippets(root, symbolMap);
    const docs = loadProjectDocs(root);
    const prompt = formatImplementationPrompt(task, plan, methods, docs);

    return new Response(JSON.stringify({ prompt }), {
        headers: { "Content-Type": "application/json" }
    });
}
