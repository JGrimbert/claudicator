import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import simpleGit from "simple-git";

const STATE_FILE = ".agent/projects.json";

export type Project = {
    id: string;
    name: string;
    path: string;
    owner?: string;
    repo?: string;
};

type State = { current: string | null; projects: Project[] };

function load(): State {
    if (fs.existsSync(STATE_FILE)) {
        try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); }
        catch { /* fichier corrompu → recréer */ }
    }
    // Bootstrap depuis les variables d'environnement
    const projectPath = process.env.TARGET_PROJECT_PATH || process.cwd();
    const defaultProject: Project = {
        id: "default",
        name: process.env.TARGET_REPO || path.basename(projectPath),
        path: projectPath,
        owner: process.env.TARGET_OWNER || undefined,
        repo:  process.env.TARGET_REPO  || undefined,
    };
    const state: State = { current: "default", projects: [defaultProject] };
    save(state);
    return state;
}

function save(state: State) {
    fs.mkdirSync(".agent", { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function listProjects(): { projects: Project[]; current: string | null } {
    const s = load();
    return { projects: s.projects, current: s.current };
}

export function getCurrentProject(): Project | null {
    const s = load();
    return s.projects.find(p => p.id === s.current) ?? s.projects[0] ?? null;
}

export function getProjectRoot(): string {
    return getCurrentProject()?.path ?? process.env.TARGET_PROJECT_PATH ?? process.cwd();
}

export function setCurrentProject(id: string): boolean {
    const s = load();
    if (!s.projects.find(p => p.id === id)) return false;
    s.current = id;
    save(s);
    return true;
}

export async function addProject(projectPath: string): Promise<Project> {
    const s = load();
    let owner: string | undefined;
    let repo: string | undefined;
    try {
        const git = simpleGit(projectPath);
        const remote = String(await git.remote(["get-url", "origin"]) || "").trim();
        const parts = remote.replace(/\.git$/, "").split(/[/\\]/);
        repo  = parts[parts.length - 1] || undefined;
        owner = parts[parts.length - 2] || undefined;
    } catch { /* pas de remote git */ }

    const name = repo || path.basename(projectPath);
    const project: Project = { id: randomUUID(), name, path: projectPath, owner, repo };
    s.projects.push(project);
    s.current = project.id;
    save(s);
    return project;
}

export function removeProject(id: string): void {
    const s = load();
    s.projects = s.projects.filter(p => p.id !== id);
    if (s.current === id) s.current = s.projects[0]?.id ?? null;
    save(s);
}
