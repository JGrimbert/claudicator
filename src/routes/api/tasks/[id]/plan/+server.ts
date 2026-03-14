import fs from "fs";
import path from "path";
import { json } from "@sveltejs/kit";
import { getTask, getTasksDir } from "$lib/server/services/tasks";

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
