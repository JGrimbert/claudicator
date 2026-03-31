/** Liste les skills de cluster depuis .claude/commands/cluster-*.md */
import { json } from "@sveltejs/kit";
import fs from "fs";
import path from "path";

export type ClusterSkill = {
    id: string;      // "task-workflow"
    name: string;    // "Cluster task-workflow"
    file: string;    // "cluster-task-workflow.md"
    touches: number; // issu du nom de fichier, sinon 0
};

export async function GET() {
    const commandsDir = path.join(process.cwd(), ".claude", "commands");
    let files: string[];
    try {
        files = fs.readdirSync(commandsDir);
    } catch {
        return json([]);
    }

    const clusters: ClusterSkill[] = files
        .filter(f => f.startsWith("cluster-") && f.endsWith(".md"))
        .map(f => {
            const id = f.replace(/^cluster-/, "").replace(/\.md$/, "");
            let name = `cluster-${id}`;
            try {
                const content = fs.readFileSync(path.join(commandsDir, f), "utf-8");
                const h1 = content.split("\n").find(l => l.startsWith("# "));
                if (h1) name = h1.replace(/^# /, "").trim();
            } catch { /* garder le nom par défaut */ }
            return { id, name, file: f, touches: 0 };
        })
        .sort((a, b) => a.id.localeCompare(b.id));

    return json(clusters);
}
