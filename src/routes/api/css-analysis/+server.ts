/** CSS Analysis — lance/retourne l'audit CSS Claude */
import fs from "fs";
import { json } from "@sveltejs/kit";
import { getProjectRoot, getCurrentProject } from "$lib/server/services/projects";
import { collectCssFiles, buildCssPrompt } from "$lib/server/agent/css-analysis";
import { spawnClaudeStream } from "$lib/server/agent/claude-stream";
import { loadCssHistory } from "$lib/server/services/css-history";

const ANALYSIS_FILE = ".agent/css-analysis.md";

/** Retourne le contenu de l'analyse CSS + l'historique (null si aucune) */
export async function GET() {
    const history = loadCssHistory();
    if (!fs.existsSync(ANALYSIS_FILE)) return json({ content: null, history });
    return json({ content: fs.readFileSync(ANALYSIS_FILE, "utf-8"), history });
}

/** Déclenche une nouvelle analyse CSS via Claude */
export async function POST() {
    const root = getProjectRoot();
    const project = getCurrentProject();

    let prompt: string;
    try {
        const files = collectCssFiles(root);
        if (files.length === 0) {
            return json({ error: "Aucun composant Svelte avec CSS trouvé" }, { status: 400 });
        }
        prompt = buildCssPrompt(files);
    } catch (err: any) {
        return json({ error: err.message ?? String(err) }, { status: 500 });
    }

    const stream = spawnClaudeStream(prompt, project ?? {}, (lines) => {
        if (lines.length > 0) {
            fs.mkdirSync(".agent", { recursive: true });
            fs.writeFileSync(ANALYSIS_FILE, lines.join("\n"), "utf-8");
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type":  "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive",
        },
    });
}
