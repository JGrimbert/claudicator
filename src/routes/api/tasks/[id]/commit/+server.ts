/** Tâches — commite les changements sur la branche de la tâche (POST) */
import { json } from "@sveltejs/kit";
import { resolveTaskContext, updateTask } from "$lib/server/services/tasks";
import { commitAll } from "$lib/server/services/git";

/** Commite les changements de la branche de la tâche */
export async function POST({ params, request }) {
    const ctx = resolveTaskContext(params.id);
    if (!ctx) return json({ error: "Task introuvable" }, { status: 404 });
    const { task, projectRoot: root } = ctx;
    if (!task.branch) return json({ error: "Pas de branche associée" }, { status: 400 });

    const body = await request.json();
    const commitMessage: string = body.message?.trim();
    if (!commitMessage) return json({ error: "Message de commit requis" }, { status: 400 });
    try {
        await commitAll(root, commitMessage);
        updateTask(params.id, { status: "validation" });
        return json({ ok: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, { status: 500 });
    }
}
