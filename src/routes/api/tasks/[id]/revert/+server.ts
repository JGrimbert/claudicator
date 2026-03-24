/** Tâches — annule tous les changements non commités (POST) */
import { json } from "@sveltejs/kit";
import { resolveTaskContext } from "$lib/server/services/tasks";
import { revertAll } from "$lib/server/services/git";

/** Annule toutes les modifications non commitées de la branche */
export async function POST({ params }) {
    const ctx = resolveTaskContext(params.id);
    if (!ctx) return json({ error: "Task introuvable" }, { status: 404 });
    const { task, projectRoot: root } = ctx;
    if (!task.branch) return json({ error: "Pas de branche associée" }, { status: 400 });
    try {
        await revertAll(root);
        return json({ ok: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, { status: 500 });
    }
}
