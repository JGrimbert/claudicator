/** Issues — analyse et génère un plan de roadmap (POST) */
import fs from "fs";
import { getIssuesWithBodies, getSubIssues } from "$lib/server/services/github";
import { getCurrentProject } from "$lib/server/services/projects";
import { prepareIssues, buildAnalysisPrompt } from "$lib/server/agent/issue-analysis";
import { loadProjectDiagram } from "$lib/server/agent/prompt";
import { spawnClaudeStream } from "$lib/server/agent/claude-stream";

const ANALYSIS_FILE = ".agent/analysis.md";
const SNAPSHOT_FILE = ".agent/analysis-snapshot.json";

/** Sauvegarde une analyse Markdown sur disque */
function saveAnalysis(content: string, roadmapId?: string | null) {
    if (roadmapId) {
        fs.mkdirSync(".agent/roadmaps", { recursive: true });
        fs.writeFileSync(`.agent/roadmaps/${roadmapId}.md`, content, "utf-8");
    } else {
        fs.mkdirSync(".agent", { recursive: true });
        fs.writeFileSync(ANALYSIS_FILE, content, "utf-8");
    }
}

/** Persiste un snapshot JSON des issues, en conservant les états closed du snapshot précédent */
function saveSnapshot(issues: Array<{ number: number; title: string; updatedAt: string; state?: string }>) {
    fs.mkdirSync(".agent", { recursive: true });
    let merged = issues;
    if (fs.existsSync(SNAPSHOT_FILE)) {
        try {
            const old: typeof issues = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf-8"));
            const openNumbers = new Set(issues.map(i => i.number));
            const closedEntries = old.filter(s => !openNumbers.has(s.number)).map(s => ({ ...s, state: "closed" }));
            merged = [...issues, ...closedEntries];
        } catch { /* ignore */ }
    }
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(merged, null, 2), "utf-8");
}

/** Endpoint POST : déclenche une analyse GitHub */
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
    let snapshotData: Array<{ number: number; title: string; updatedAt: string; state?: string }>;
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
        snapshotData = raw.map(i => ({ number: i.number, title: i.title, updatedAt: i.updatedAt, state: (i as any).state ?? "open" }));
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
