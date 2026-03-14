import { execSync } from "child_process";

/** Exécute un prompt via la CLI Claude et retourne la réponse. */
export function askClaude(prompt: string) {
    const escaped = prompt.replace(/"/g, '\\"');

    const output = execSync(`claude "${escaped}"`, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 20
    });

    return output;
}
