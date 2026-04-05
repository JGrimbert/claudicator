import { json } from "@sveltejs/kit";
import fs from "fs";
import path from "path";
import { createTask, getTasksDir } from "$lib/server/services/tasks";

const ANALYSIS_FILE = ".agent/css-analysis.md";

/** Crée une tâche d'implémentation à partir de l'analyse CSS générée */
export async function POST() {
    if (!fs.existsSync(ANALYSIS_FILE)) {
        return json({ error: "Aucune analyse CSS disponible — lancez d'abord l'analyse" }, { status: 400 });
    }

    const analysis = fs.readFileSync(ANALYSIS_FILE, "utf-8");

    const task = createTask({
        title: "Audit CSS — nettoyage et abstraction",
        status: "implementation",
        type: "css",
    });

    const dir = getTasksDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${task.id}.plan.md`), analysis, "utf-8");

    return json(task, { status: 201 });
}
