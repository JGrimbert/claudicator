/**
 * /api/roadmap-viz
 *
 * GET  → sert ai/roadmap.html du projet courant
 * POST → (re)génère la roadmap via RoadmapGenerator
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { getProjectRoot, getCurrentProject } from "$lib/server/services/projects";
import { getIssuesWithBodies } from "$lib/server/services/github";
import { searchMethods } from "$lib/server/services/cartography";
import type { RequestHandler } from "./$types";

type CoalEntry = { symbols: string[]; issues: number[]; score: number; count: number };

/** Calcule le coal avec issues GitHub (même logique que /api/clusters). */
async function computeIssueCoal(root: string): Promise<CoalEntry[]> {
    const project = getCurrentProject();
    if (!project?.owner || !project?.repo) return [];
    let issues: { number: number; title: string; body: string | null }[] = [];
    try { issues = await getIssuesWithBodies(project.owner, project.repo); } catch { return []; }

    const symbolToIssues = new Map<string, Set<number>>();
    const issueToSymbols = new Map<number, Set<string>>();
    for (const issue of issues) {
        for (const { key } of searchMethods(issue.title, root)) {
            if (!symbolToIssues.has(key)) symbolToIssues.set(key, new Set());
            symbolToIssues.get(key)!.add(issue.number);
            if (!issueToSymbols.has(issue.number)) issueToSymbols.set(issue.number, new Set());
            issueToSymbols.get(issue.number)!.add(key);
        }
    }
    const freqSyms = [...symbolToIssues.entries()].filter(([, s]) => s.size >= 2).map(([k]) => k);
    const seen = new Map<string, { symbols: string[]; issues: number[] }>();
    for (let i = 0; i < freqSyms.length; i++) {
        for (let j = i + 1; j < freqSyms.length; j++) {
            const common = [...symbolToIssues.get(freqSyms[i])!]
                .filter(n => symbolToIssues.get(freqSyms[j])!.has(n))
                .sort((a, b) => a - b);
            if (common.length < 2) continue;
            const k = common.join(",");
            if (seen.has(k)) continue;
            const syms = freqSyms.filter(s => common.every(n => issueToSymbols.get(n)?.has(s)));
            if (syms.length < 2) continue;
            seen.set(k, { symbols: syms, issues: common });
        }
    }
    return [...seen.values()]
        .map(({ symbols, issues }) => ({ symbols, issues, score: symbols.length * issues.length, count: issues.length }))
        .sort((a, b) => b.score - a.score);
}

const LC_PATH   = process.env.LC_PATH ?? "C:/lolve-cartography";
const _require  = createRequire(import.meta.url);

// ─── GET : sert le HTML ────────────────────────────────────────────────────────

export const GET: RequestHandler = () => {
    const projectRoot = getProjectRoot();
    const htmlPath    = path.join(projectRoot, "ai", "roadmap.html");

    if (!fs.existsSync(htmlPath)) {
        return new Response(
            `<!DOCTYPE html><html><body style="background:#242424;color:#cdb4f3;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
             <p>Roadmap non générée.<br><small>Clique sur ↺ pour lancer la génération.</small></p>
             </body></html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
    }

    return new Response(fs.readFileSync(htmlPath, "utf-8"), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
};

// ─── POST : génère / régénère ─────────────────────────────────────────────────

export const POST: RequestHandler = async () => {
    try {
        const projectRoot = getProjectRoot();

        // Purger le cache require pour roadmap-generator et ses dépendances
        // (au cas où le projet aurait changé depuis le dernier appel)
        const roadmapModules = [
            `${LC_PATH}/lib/roadmap-generator.cjs`,
            `${LC_PATH}/lib/fact-extractor.cjs`,
            `${LC_PATH}/lib/rule-engine.cjs`,
            `${LC_PATH}/lib/dag-builder.cjs`,
            `${LC_PATH}/lib/step-planner.cjs`,
            `${LC_PATH}/lib/roadmap-formatter.cjs`,
            `${LC_PATH}/lib/roadmap-visualizer.cjs`,
            `${LC_PATH}/lib/spine-extractor.cjs`,
            `${LC_PATH}/lib/concept-builder.cjs`,
            `${LC_PATH}/lib/pattern-detector.cjs`,
            `${LC_PATH}/lib/pipeline-detector.cjs`,
        ];
        for (const mod of roadmapModules) {
            try { delete _require.cache[_require.resolve(mod)]; } catch { /* pas encore chargé */ }
        }

        // 1. Coal avec issues GitHub (source principale)
        let clusterData: { coal: CoalEntry[] } | null = null;
        const issueCoal = await computeIssueCoal(projectRoot);
        if (issueCoal.length > 0) {
            clusterData = { coal: issueCoal };
        } else {
            // 2. Fallback : coal git-history (sans issues)
            const stateFile = path.join(projectRoot, '.agent', 'git-history', 'state.json');
            if (fs.existsSync(stateFile)) {
                try {
                    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
                    if (Array.isArray(state.coal) && state.coal.length > 0) {
                        clusterData = { coal: state.coal };
                    }
                } catch { /* état corrompu, on ignore */ }
            }
        }

        const { RoadmapGenerator } = _require(`${LC_PATH}/lib/roadmap-generator.cjs`);
        await new RoadmapGenerator(projectRoot, { clusterData }).generate();

        return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
