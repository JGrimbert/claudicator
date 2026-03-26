/** Tâches — cycle de vie des tâches (create, read, update, delete, status) */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getCurrentProject, getProjectRoot } from "./projects";

export type TaskStatus =
  | "specification"    // tâche créée, plan non encore généré
  | "planification"    // Claude génère le plan (processus actif)
  | "implementation"   // plan prêt, implémentation à lancer ou en cours
  | "documentation"    // implémentation terminée, à commiter
  | "validation"       // commitée sur la branche, à pusher
  | "merged"           // mergée, état final
  | "failed";          // erreur à n'importe quelle étape

export type TokenUsage = {
    inputTokens: number;
    outputTokens: number;
};

export type TaskType = "standard" | "fullplan";

export type Task = {
    id: string;
    title: string;
    status: TaskStatus;
    type?: TaskType;          // "fullplan" pour les plans complets de groupe
    fullPlanId?: string;      // référence au FullPlan associé (si type === "fullplan")
    issueNumber?: number;
    branch?: string;
    pushed?: boolean;
    logs: string[];
    usage?: TokenUsage;       // tokens du dernier run
    totalUsage?: TokenUsage;  // tokens cumulés (tous runs)
    planUsage?: TokenUsage;   // tokens phase planification
    implUsage?: TokenUsage;   // tokens phase implémentation
    hasPlan?: boolean;        // fichier .plan.md présent
    atlasEnabled?: boolean;   // inclure ATLAS.md dans le prompt
    createdAt: string;
    updatedAt: string;
};

/** Retourne le dossier des tasks pour le projet courant.
 *  Le projet "default" (lolve historique) conserve l'ancien chemin pour la rétrocompatibilité. */
export function getTasksDir(): string {
    const id = getCurrentProject()?.id ?? "default";
    return id === "default" ? ".agent/tasks" : path.join(".agent/tasks", id);
}

/** Crée le dossier tasks si absent */
function ensureDir() {
    fs.mkdirSync(getTasksDir(), { recursive: true });
}

/** Chemin vers le fichier JSON d'une task */
function taskPath(id: string) {
    return path.join(getTasksDir(), `${id}.json`);
}

/** Migration à la volée des anciens statuts vers les nouveaux. */
function migrateTaskStatus(raw: any): Task {
    const task = raw as Task;
    const status = raw.status as string;
    if (status === "pending") {
        task.status = "specification";
    } else if (status === "running") {
        task.status = "failed";
    } else if (status === "done") {
        if (task.pushed) {
            task.status = "validation";
        } else if (task.branch) {
            task.status = "documentation";
        } else {
            task.status = "implementation";
        }
    }
    return task;
}

/** Liste toutes les tasks triées par date */
export function listTasks(): Task[] {
    ensureDir();
    const dir = getTasksDir();
    return fs.readdirSync(dir)
        .filter(f => f.endsWith(".json"))
        .map(f => {
            const task = migrateTaskStatus(JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
            task.hasPlan = fs.existsSync(path.join(dir, `${task.id}.plan.md`));
            return task;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Charge une task par son identifiant */
export function getTask(id: string): Task | null {
    const p = taskPath(id);
    if (!fs.existsSync(p)) return null;
    return migrateTaskStatus(JSON.parse(fs.readFileSync(p, "utf-8")));
}

/** Crée une task (déduplique par numéro d'issue pour les tasks standard) */
export function createTask(data: Pick<Task, "title"> & Partial<Pick<Task, "issueNumber" | "branch" | "type" | "fullPlanId" | "status">>): Task {
    ensureDir();
    if (data.issueNumber !== undefined && data.type !== "fullplan") {
        const existing = listTasks().find(t => t.issueNumber === data.issueNumber);
        if (existing) return existing;
    }
    const task: Task = {
        id: randomUUID(),
        title: data.title,
        status: data.status ?? "specification",
        type: data.type,
        fullPlanId: data.fullPlanId,
        issueNumber: data.issueNumber,
        branch: data.branch,
        logs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(taskPath(task.id), JSON.stringify(task, null, 2));
    return task;
}

/** Met à jour les champs d'une task */
export function updateTask(id: string, patch: Partial<Pick<Task, "status" | "logs" | "branch" | "pushed" | "usage" | "totalUsage" | "planUsage" | "implUsage" | "atlasEnabled">>): Task | null {
    const task = getTask(id);
    if (!task) return null;
    const updated: Task = { ...task, ...patch, updatedAt: new Date().toISOString() };
    fs.writeFileSync(taskPath(id), JSON.stringify(updated, null, 2));
    return updated;
}

/** Résout le contexte d'une tâche : task + racine du projet.
 *  Retourne null si la tâche n'existe pas. */
export function resolveTaskContext(id: string): { task: Task; projectRoot: string } | null {
    const task = getTask(id);
    if (!task) return null;
    return { task, projectRoot: getProjectRoot() };
}

/** Supprime le fichier d'une task */
export function deleteTask(id: string): boolean {
    const p = taskPath(id);
    if (!fs.existsSync(p)) return false;
    fs.unlinkSync(p);
    return true;
}
