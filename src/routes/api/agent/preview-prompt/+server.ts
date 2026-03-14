import { getTask } from "$lib/server/services/tasks";
import { getProjectRoot } from "$lib/server/services/projects";
import { loadMethodSnippets } from "$lib/server/agent/context";
import { formatImplementationPrompt, loadProjectDocs } from "$lib/server/agent/prompt";
import { generateAtlasStrings } from "$lib/server/services/cartography";

/** Crée le commit initial d'un plan de tâche */
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

    const planHint = plan.replace(/\n+/g, " ").trim().slice(0, 250);
    const query    = `${task.title} ${planHint}`;
    const methods  = loadMethodSnippets(root, query);
    const docs     = loadProjectDocs(root);
    const atlas    = generateAtlasStrings(root, query)?.compressed;
    const prompt = formatImplementationPrompt(task, plan, methods, docs, atlas);

    return new Response(JSON.stringify({ prompt }), {
        headers: { "Content-Type": "application/json" }
    });
}
