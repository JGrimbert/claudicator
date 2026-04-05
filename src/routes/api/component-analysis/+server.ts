/** Component Analysis — audit architecture composants via Claude */
import fs from "fs";
import { json } from "@sveltejs/kit";
import { getProjectRoot, getCurrentProject } from "$lib/server/services/projects";
import { collectComponents, buildComponentPrompt } from "$lib/server/agent/component-analysis";
import { spawnClaudeStream } from "$lib/server/agent/claude-stream";
import { loadComponentHistory } from "$lib/server/services/component-history";

const ANALYSIS_FILE = ".agent/component-analysis.md";

export async function GET() {
    const history = loadComponentHistory();
    if (!fs.existsSync(ANALYSIS_FILE)) return json({ content: null, history });
    return json({ content: fs.readFileSync(ANALYSIS_FILE, "utf-8"), history });
}

export async function POST() {
    const root = getProjectRoot();
    const project = getCurrentProject();

    let prompt: string;
    try {
        const components = collectComponents(root);
        if (components.length === 0)
            return json({ error: "Aucun composant Svelte trouvé" }, { status: 400 });
        prompt = buildComponentPrompt(components);
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
