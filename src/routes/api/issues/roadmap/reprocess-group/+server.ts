/** Roadmap — retire les issues fermées d'un groupe dans le Markdown (POST) */
import fs from "fs";
import { json } from "@sveltejs/kit";

const ANALYSIS_FILE = ".agent/analysis.md";

/**
 * Retire les issues fermées de la ligne `Issues :` du groupe spécifié.
 * Si la liste résultante est vide, supprime tout le bloc du groupe.
 */
function removeClosedFromGroup(content: string, groupIndex: number, closedIssues: number[]): string {
    const closed = new Set(closedIssues);
    // Découpe en blocs ### Groupe N
    const blocks = content.split(/(?=### Groupe \d)/);
    const processed = blocks.map(block => {
        const headMatch = block.match(/^### Groupe (\d+)/);
        if (!headMatch) return block;
        const idx = parseInt(headMatch[1]);
        if (idx !== groupIndex) return block;

        // Modifier la ligne Issues :
        const updated = block.replace(
            /Issues\s*:\s*((?:#\d+(?:,\s*)?)+)/,
            (_, list) => {
                const remaining = [...list.matchAll(/#(\d+)/g)]
                    .map(m => parseInt(m[1]))
                    .filter(n => !closed.has(n));
                if (remaining.length === 0) return "Issues : ";
                return `Issues : ${remaining.map(n => `#${n}`).join(", ")}`;
            }
        );

        // Si la liste Issues est vide → supprimer tout le bloc
        if (/Issues\s*:\s*$/.test(updated.split("\n").find(l => /Issues\s*:/.test(l)) ?? "")) {
            return "";
        }
        return updated;
    });
    return processed.join("");
}

export async function POST({ request }: { request: Request }) {
    const { roadmapId, groupIndex, closedIssues } = await request.json();

    const filePath: string = roadmapId
        ? `.agent/roadmaps/${roadmapId}.md`
        : ANALYSIS_FILE;

    if (!fs.existsSync(filePath)) {
        return json({ error: "Fichier introuvable" }, { status: 404 });
    }

    let content = fs.readFileSync(filePath, "utf-8");
    content = removeClosedFromGroup(content, groupIndex, closedIssues);
    fs.writeFileSync(filePath, content, "utf-8");

    return json({ content });
}
