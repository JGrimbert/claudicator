/** Issues — met à jour une analyse existante via Claude (POST) */
import fs from "fs";
import { getIssuesWithBodies } from "$lib/server/services/github";
import { getCurrentProject } from "$lib/server/services/projects";
import { prepareIssues, buildUpdatePrompt } from "$lib/server/agent/issue-analysis";
import { loadProjectDiagram } from "$lib/server/agent/prompt";
import { spawnClaudeStream } from "$lib/server/agent/claude-stream";

const ANALYSIS_FILE = ".agent/analysis.md";
const SNAPSHOT_FILE = ".agent/analysis-snapshot.json";

/** Récupère les issues GitHub du projet courant */
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

    const analysisPath = roadmapId ? `.agent/roadmaps/${roadmapId}.md` : ANALYSIS_FILE;

    if (!fs.existsSync(analysisPath)) {
        return new Response(JSON.stringify({ error: "Aucune analyse existante" }), {
            status: 400, headers: { "Content-Type": "application/json" }
        });
    }
    const existingAnalysis = fs.readFileSync(analysisPath, "utf-8");

    let snapshot: Array<{ number: number; title: string; updatedAt: string }> = [];
    if (fs.existsSync(SNAPSHOT_FILE)) {
        try { snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf-8")); } catch { /* ignore */ }
    }

    let prompt: string;
    let newSnapshotData: Array<{ number: number; title: string; updatedAt: string }>;
    try {
        const raw = await getIssuesWithBodies(owner, repo);
        const snapshotMap = new Map(snapshot.map(s => [s.number, s.updatedAt]));
        const toIntegrate = raw.filter(i =>
            !snapshotMap.has(i.number) || i.updatedAt > (snapshotMap.get(i.number) ?? "")
        );

        if (toIntegrate.length === 0) {
            return new Response(JSON.stringify({ message: "Aucune issue à intégrer" }), {
                status: 200, headers: { "Content-Type": "application/json" }
            });
        }

        const prepared = await prepareIssues(toIntegrate);
        const diagram = loadProjectDiagram(project?.path ?? process.cwd());
        prompt = buildUpdatePrompt(existingAnalysis, prepared, diagram);
        newSnapshotData = raw.map(i => ({ number: i.number, title: i.title, updatedAt: i.updatedAt }));
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
            status: 500, headers: { "Content-Type": "application/json" }
        });
    }

    const stream = spawnClaudeStream(prompt, project ?? {}, (lines) => {
        if (lines.length > 0) {
            const dir = roadmapId ? ".agent/roadmaps" : ".agent";
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(analysisPath, lines.join("\n"), "utf-8");
            // Upsert du snapshot
            const snapshotMap = new Map(snapshot.map(s => [s.number, s]));
            for (const entry of newSnapshotData) snapshotMap.set(entry.number, entry);
            fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify([...snapshotMap.values()], null, 2), "utf-8");
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
