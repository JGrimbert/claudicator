/** Skill proposals — génération de compétences à partir des clusters (issue #121) */
import fs           from "fs";
import path         from "path";
import { createHash } from "crypto";
import { execSync } from "child_process";
import { getProjectRoot } from "./projects";

// ── Types ────────────────────────────────────────────────────────────────────

export type SkillProposal = {
    id:             string;         // hash déterministe des symboles
    skill:          string;         // titre généré par haiku
    source:         "coal" | "historical";
    description:    string;
    clusterSymbols: string[];
    clusterIssues:  number[];
    score:          number;
    generatedAt:    string;         // ISO 8601
};

// ── Persistance ───────────────────────────────────────────────────────────────

function getSkillsDir(): string { return ".agent/skills"; }
function proposalsPath(): string { return path.join(getSkillsDir(), "proposals.json"); }

export function loadProposals(): SkillProposal[] {
    if (!fs.existsSync(proposalsPath())) return [];
    try { return JSON.parse(fs.readFileSync(proposalsPath(), "utf-8")); }
    catch { return []; }
}

export function saveProposals(proposals: SkillProposal[]): void {
    fs.mkdirSync(getSkillsDir(), { recursive: true });
    fs.writeFileSync(proposalsPath(), JSON.stringify(proposals, null, 2));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Hash déterministe court à partir des symboles triés du cluster. */
export function slugify(symbols: string[]): string {
    const key = [...symbols].sort().join(",");
    return createHash("sha1").update(key).digest("hex").slice(0, 12);
}

// ── Prompt ───────────────────────────────────────────────────────────────────

export function buildPrompt(
    symbols: string[],
    source:  "coal" | "historical",
    issues:  number[],
    count:   number,
): string {
    const issueList   = issues.map(n => `#${n}`).join(" ");
    const sourceLabel = source === "historical"
        ? `historique git (${count} commits communs, issues : ${issueList})`
        : `coalescence sémantique (${count} issues communes : ${issueList})`;

    return `Tu génères un titre de skill à partir d'un cluster de symboles de code.

Cluster :
- Symboles : ${symbols.join(", ")}
- Provenance : ${sourceLabel}

Réponds UNIQUEMENT dans ce format exact, sans autre texte :
skill: <intitulé court, forme verbale, orienté action>
source: ${source}
description: <résumé en une phrase de la compétence>`;
}

export function parseHaikuResponse(raw: string): { skill: string; description: string } {
    const skillMatch = raw.match(/^skill:\s*(.+)$/m);
    const descMatch  = raw.match(/^description:\s*(.+)$/m);
    return {
        skill:       skillMatch?.[1]?.trim() ?? "unknown",
        description: descMatch?.[1]?.trim()  ?? "",
    };
}

// ── Invocation Claude Haiku ───────────────────────────────────────────────────

export function invokeHaiku(prompt: string): string {
    const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } =
        process.env as Record<string, string | undefined>;
    const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";
    return execSync(
        `${claudeCmd} -p --model claude-haiku-4-5-20251001 --dangerously-skip-permissions`,
        {
            input:    prompt,
            env:      cleanEnv as NodeJS.ProcessEnv,
            cwd:      getProjectRoot(),
            encoding: "utf-8",
            timeout:  30_000,
        },
    );
}
