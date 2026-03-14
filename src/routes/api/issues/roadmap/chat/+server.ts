import fs from "fs";
import { getCurrentProject } from "$lib/server/services/projects";
import { buildChatPrompt } from "$lib/server/agent/issue-analysis";
import { spawnClaudeStream } from "$lib/server/agent/claude-stream";

const ANALYSIS_FILE = ".agent/analysis.md";

/** Envoie un message à un agent roadmap */
export async function POST({ request }: { request: Request }) {
    const body = await request.json().catch(() => ({}));
    const message: string = body.message ?? "";
    const roadmapId: string | null = body.roadmapId ?? null;

    if (!message.trim()) {
        return new Response(JSON.stringify({ error: "Message vide" }), {
            status: 400, headers: { "Content-Type": "application/json" }
        });
    }

    const analysisPath = roadmapId ? `.agent/roadmaps/${roadmapId}.md` : ANALYSIS_FILE;
    if (!fs.existsSync(analysisPath)) {
        return new Response(JSON.stringify({ error: "Aucune analyse existante" }), {
            status: 400, headers: { "Content-Type": "application/json" }
        });
    }

    const existingAnalysis = fs.readFileSync(analysisPath, "utf-8");
    const project = getCurrentProject();
    const prompt = buildChatPrompt(existingAnalysis, message);

    const stream = spawnClaudeStream(prompt, project ?? {}, (lines) => {
        if (lines.length > 0) {
            const dir = roadmapId ? ".agent/roadmaps" : ".agent";
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(analysisPath, lines.join("\n"), "utf-8");
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type":  "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive"
        }
    });
}
