import fs from "fs";
import path from "path";
import { getCurrentProject } from "./projects";

export type ProjectConfig = {
    /** Dossiers supplémentaires à ignorer dans la recherche cartography */
    extraIgnoreDirs: string[];
    /** Mots-clés pour lesquels seules les lignes de commentaires sont retournées */
    commentOnlyKeywords: string[];
};

/** Toujours ignorés, quel que soit le projet */
export const GLOBAL_IGNORE_DIRS = [
    ".svelte-kit", "build", "coverage", ".next", "__pycache__", "out", ".turbo", ".vercel"
];

export const DEFAULT_CONFIG: ProjectConfig = {
    extraIgnoreDirs: [],
    commentOnlyKeywords: ["todo", "fixme", "hack", "xxx"],
};

function configFilePath(): string {
    const id = getCurrentProject()?.id ?? "default";
    return id === "default"
        ? path.join(".agent", "config.json")
        : path.join(".agent", id, "config.json");
}

export function getProjectConfig(): ProjectConfig {
    const p = configFilePath();
    if (fs.existsSync(p)) {
        try {
            const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
            return { ...DEFAULT_CONFIG, ...raw };
        } catch { /* corrompu */ }
    }
    return { ...DEFAULT_CONFIG };
}

export function setProjectConfig(patch: Partial<ProjectConfig>): ProjectConfig {
    const p = configFilePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const current = getProjectConfig();
    const updated = { ...current, ...patch };
    fs.writeFileSync(p, JSON.stringify(updated, null, 2));
    return updated;
}
