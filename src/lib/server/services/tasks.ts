import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getCurrentProject } from "./projects";

export type TaskStatus = "pending" | "running" | "done" | "failed";

export type Task = {
    id: string;
    title: string;
    status: TaskStatus;
    issueNumber?: number;
    branch?: string;
    logs: string[];
    createdAt: string;
    updatedAt: string;
};

/** Retourne le dossier des tasks pour le projet courant.
 *  Le projet "default" (lolve historique) conserve l'ancien chemin pour la rétrocompatibilité. */
export function getTasksDir(): string {
    const id = getCurrentProject()?.id ?? "default";
    return id === "default" ? ".agent/tasks" : path.join(".agent/tasks", id);
}

function ensureDir() {
    fs.mkdirSync(getTasksDir(), { recursive: true });
}

function taskPath(id: string) {
    return path.join(getTasksDir(), `${id}.json`);
}

export function listTasks(): Task[] {
    ensureDir();
    return fs.readdirSync(getTasksDir())
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(getTasksDir(), f), "utf-8")) as Task)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTask(id: string): Task | null {
    const p = taskPath(id);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function createTask(data: Pick<Task, "title"> & Partial<Pick<Task, "issueNumber" | "branch">>): Task {
    ensureDir();
    if (data.issueNumber !== undefined) {
        const existing = listTasks().find(t => t.issueNumber === data.issueNumber);
        if (existing) return existing;
    }
    const task: Task = {
        id: randomUUID(),
        title: data.title,
        status: "pending",
        issueNumber: data.issueNumber,
        branch: data.branch,
        logs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(taskPath(task.id), JSON.stringify(task, null, 2));
    return task;
}

export function updateTask(id: string, patch: Partial<Pick<Task, "status" | "logs" | "branch">>): Task | null {
    const task = getTask(id);
    if (!task) return null;
    const updated: Task = { ...task, ...patch, updatedAt: new Date().toISOString() };
    fs.writeFileSync(taskPath(id), JSON.stringify(updated, null, 2));
    return updated;
}

export function deleteTask(id: string): boolean {
    const p = taskPath(id);
    if (!fs.existsSync(p)) return false;
    fs.unlinkSync(p);
    return true;
}
