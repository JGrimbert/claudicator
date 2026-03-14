import { spawn } from "child_process";
import type { Task } from "../services/tasks";
import { buildContext } from "./context";
import { classifyFile, type SemanticRegion } from "./segments";
import { selectSkill, type Skill } from "./skills";
import { getSessionWithCode, generateAtlasStrings } from "../services/cartography";
import { formatPrompt, loadConceptMap, loadProjectDocs } from "./prompt";

// ─── Types publics ─────────────────────────────────────────────────────────────

export type SubAgentEvent = {
    segment: SemanticRegion | 'merged';
    type: 'text' | 'system' | 'done' | 'error';
    payload: string;
};

export type OrchestrationSegment = {
    region: SemanticRegion;
    skill:  Skill;
    files:  string[];
    plan:   string;
};

export type OrchestrationResult = {
    segments:   OrchestrationSegment[];
    mergedPlan: string;
};

// ─── Spawn d'un agent Claude en mode one-shot (-p) ────────────────────────────

function spawnClaudeOneShot(
    prompt:      string,
    projectRoot: string,
    onText:      (line: string) => void,
    onSystem:    (line: string) => void,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } =
            process.env as Record<string, string | undefined>;
        const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";
        const proc = spawn(
            claudeCmd,
            ["-p", "--verbose", "--dangerously-skip-permissions",
             "--output-format", "stream-json", "--add-dir", projectRoot],
            { shell: true, windowsHide: true, env: cleanEnv, cwd: projectRoot },
        );

        if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }

        const planLines: string[] = [];
        let stdoutBuf = "";

        proc.stdout.on("data", (chunk: Buffer) => {
            stdoutBuf += chunk.toString();
            const lines = stdoutBuf.split("\n");
            stdoutBuf = lines.pop() ?? "";
            for (const rawLine of lines) {
                if (!rawLine.trim()) continue;
                try {
                    const obj = JSON.parse(rawLine);
                    if (obj.type === "assistant") {
                        for (const block of (obj.message?.content ?? [])) {
                            if (block.type === "text" && block.text) {
                                onText(block.text);
                                planLines.push(block.text);
                            } else if (block.type === "tool_use" && block.name) {
                                const inp = block.input as Record<string, unknown> | undefined;
                                const hint = inp
                                    ? Object.values(inp).find(v => typeof v === "string") as string | undefined
                                    : undefined;
                                onSystem(`⚙ ${block.name}${hint ? ` ${hint.slice(0, 80)}` : ""}`);
                            }
                        }
                    }
                } catch {
                    onText(rawLine);
                    planLines.push(rawLine);
                }
            }
        });

        proc.stderr.on("data", (chunk: Buffer) => {
            const text = chunk.toString().replace(/\x1B\[[0-9;]*[mGKHF]/g, "").trim();
            if (text) onSystem(text);
        });

        proc.on("error", reject);
        proc.on("close", () => {
            if (stdoutBuf.trim()) {
                try {
                    const obj = JSON.parse(stdoutBuf.trim());
                    if (obj.type === "assistant") {
                        for (const block of (obj.message?.content ?? [])) {
                            if (block.type === "text" && block.text) {
                                onText(block.text);
                                planLines.push(block.text);
                            }
                        }
                    }
                } catch {
                    onText(stdoutBuf);
                    planLines.push(stdoutBuf);
                }
            }
            resolve(planLines.join("\n"));
        });
    });
}

// ─── Orchestrateur principal ───────────────────────────────────────────────────

/**
 * Orchestre N agents Claude spécialisés en parallèle, un par segment sémantique détecté.
 * Fusionne les résultats dans un plan unifié.
 *
 * Si la tâche touche un seul segment → un seul agent avec la skill ciblée.
 * Si multi-segment → agents parallèles, un par région, plans fusionnés.
 */
export async function orchestrate(
    task:        Pick<Task, "id" | "title">,
    projectRoot: string,
    description: string | undefined,
    onEvent:     (event: SubAgentEvent) => void,
): Promise<OrchestrationResult> {
    const query = `${task.title}${description ? " " + description.slice(0, 250) : ""}`;

    // 1. Identifier les fichiers affectés et les grouper par segment
    const results = getSessionWithCode(query, projectRoot);
    const filesByRegion = new Map<SemanticRegion, string[]>();
    for (const r of results) {
        const region = classifyFile(r.file);
        if (region === "config" || region === "tests") continue;
        if (!filesByRegion.has(region)) filesByRegion.set(region, []);
        const files = filesByRegion.get(region)!;
        if (!files.includes(r.file)) files.push(r.file);
    }

    // Fallback : si aucun segment détecté, contexte complet mono-agent
    if (filesByRegion.size === 0) {
        onEvent({ segment: "merged", type: "system", payload: "[orchestrateur] aucun segment détecté — mode mono-agent" });
        const ctx = buildContext(task, projectRoot, description);
        onEvent({ segment: "merged", type: "done", payload: "" });
        return { segments: [], mergedPlan: ctx.prompt };
    }

    const conceptMap  = loadConceptMap(projectRoot) ?? undefined;
    const projectDocs = loadProjectDocs(projectRoot);

    // 2. Lancer N agents en parallèle (un par segment)
    const segmentEntries = [...filesByRegion.entries()];
    const segmentResults: OrchestrationSegment[] = [];

    await Promise.all(segmentEntries.map(async ([region, files]) => {
        const skill = selectSkill([region]);
        onEvent({
            segment: region,
            type: "system",
            payload: `[▶ ${region}] ${skill.label} — ${files.length} fichier(s)`,
        });

        const atlas = generateAtlasStrings(projectRoot, query)?.compressed;
        const minCtx = {
            task: { id: task.id, title: task.title },
            symbolMap: {},
            prompt: "",
            skill,
        };
        const prompt = formatPrompt(minCtx as any, { description, conceptMap, projectDocs, atlas, skill });

        try {
            const plan = await spawnClaudeOneShot(
                prompt,
                projectRoot,
                (text) => onEvent({ segment: region, type: "text",   payload: text }),
                (sys)  => onEvent({ segment: region, type: "system", payload: sys  }),
            );
            onEvent({ segment: region, type: "done", payload: "" });
            segmentResults.push({ region, skill, files, plan });
        } catch (err: any) {
            onEvent({ segment: region, type: "error", payload: err.message ?? String(err) });
        }
    }));

    // 3. Fusionner les plans par ordre de segment
    const order: SemanticRegion[] = ["domain", "infra", "api", "ui", "store", "tests"];
    segmentResults.sort((a, b) => order.indexOf(a.region) - order.indexOf(b.region));

    const mergedPlan = segmentResults
        .map(s => `## Segment : ${s.region} (${s.skill.label})\n\n${s.plan}`)
        .join("\n\n---\n\n");

    onEvent({ segment: "merged", type: "text", payload: mergedPlan });
    return { segments: segmentResults, mergedPlan };
}
