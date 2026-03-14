/** Agent — envoie une entrée stdin au processus actif (POST) */
import { json } from "@sveltejs/kit";
import { writeInput, isRunning } from "$lib/server/services/processes";

/** Envoie une entrée stdin à un processus actif */
export async function POST({ request }) {
    const { taskId, input } = await request.json();
    if (!taskId || input === undefined) return json({ error: "taskId ou input manquant" }, { status: 400 });
    if (!isRunning(taskId)) return json({ error: "Aucun process actif pour cette task" }, { status: 404 });

    const ok = writeInput(taskId, input);
    return json({ ok });
}
