import fs from "fs";
import { getIssuesWithBodies, getSubIssues } from "$lib/server/services/github";
import { getCurrentProject } from "$lib/server/services/projects";
import { prepareIssues, buildAnalysisPrompt } from "$lib/server/agent/issue-analysis";
import { loadProjectDiagram } from "$lib/server/agent/prompt";
import { spawnClaudeStream } from "$lib/server/agent/claude-stream";

const ANALYSIS_FILE = ".agent/analysis.md";
const SNAPSHOT_FILE = ".agent/analysis-snapshot.json";

function saveAnalysis(content: string, roadmapId?: string | null) {
    if (roadmapId) {
        fs.mkdirSync(".agent/roadmaps", { recursive: true });
        fs.writeFileSync(`.agent/roadmaps/${roadmapId}.md`, content, "utf-8");
    } else {
        fs.mkdirSync(".agent", { recursive: true });
        fs.writeFileSync(ANALYSIS_FILE, content, "utf-8");
    }
}

function saveSnapshot(issues: Array<{ number: number; title: string; updatedAt: string }>) {
    fs.mkdirSync(".agent", { recursive: true });
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(issues, null, 2), "utf-8");
}

export async function POST({ request }: { request: Request }) {
    const body = await request.json().catch(() => ({}));
    const roadmapId: string | null = body.roadmapId ?? null;

    const project = getCurrentProject();
    const owner = project?.owner;
    const repo  = project?.repo;

    if (!owner || !repo) {
        return new Response(JSON.stringify({ error: "Aucun owner/repo configuré" }), {
            status: 500, headers: { "Content-Type": "application/json" }
        });
    }

    let prompt: string;
    let snapshotData: Array<{ number: number; title: string; updatedAt: string }>;
    try {
        const raw = await getIssuesWithBodies(owner, repo);
        // Enrichir avec les sub-issues
        const enriched = await Promise.all(raw.map(async i => {
            try {
                const subs = await getSubIssues(owner, repo, i.number);
                return { ...i, subIssues: subs.map(s => s.number) };
            } catch {
                return { ...i, subIssues: [] as number[] };
            }
        }));
        const prepared = await prepareIssues(enriched);
        const diagram = loadProjectDiagram(project?.path ?? process.cwd());
        prompt = buildAnalysisPrompt(prepared, diagram);
        snapshotData = raw.map(i => ({ number: i.number, title: i.title, updatedAt: i.updatedAt }));
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
            status: 500, headers: { "Content-Type": "application/json" }
        });
    }

    const stream = spawnClaudeStream(prompt, project ?? {}, (lines) => {
        if (lines.length > 0) {
            saveAnalysis(lines.join("\n"), roadmapId);
            saveSnapshot(snapshotData);
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
