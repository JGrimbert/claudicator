/** Tâches — lit le plan de la tâche depuis le disque (GET) ou le sauvegarde (POST) */
import fs from "fs";
import path from "path";
import { json } from "@sveltejs/kit";
import { getTask, updateTask, getTasksDir } from "$lib/server/services/tasks";

/** Lit et retourne le plan d'une tâche */
export async function GET({ params }) {
    const task = getTask(params.id);
    if (!task) return json({ error: "Task introuvable" }, { status: 404 });

    const planPath = path.join(getTasksDir(), `${params.id}.plan.md`);
    if (!fs.existsSync(planPath)) {
        return json({ content: null });
    }

    const content = fs.readFileSync(planPath, "utf-8");
    return json({ content });
}

/** Sauvegarde un plan manuellement (ex: plan vide pour sauter l'étape) */
export async function POST({ params, request }) {
    const task = getTask(params.id);
    if (!task) return json({ error: "Task introuvable" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const content = typeof body.content === "string" ? body.content : "# Plan\n\n_Aucun plan généré._";

    const planPath = path.join(getTasksDir(), `${params.id}.plan.md`);
    fs.writeFileSync(planPath, content, "utf-8");

    const updated = updateTask(params.id, { status: "implementation", hasPlan: true });
    return json({ ok: true, task: updated });
}
