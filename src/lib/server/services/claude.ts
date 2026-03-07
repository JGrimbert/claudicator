import { execSync } from "child_process";

export function askClaude(prompt: string) {
    const escaped = prompt.replace(/"/g, '\\"');

    const output = execSync(`claude "${escaped}"`, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 20
    });

    return output;
}
