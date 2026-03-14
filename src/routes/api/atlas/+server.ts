/** Atlas — retourne les régions sémantiques et compétences (GET) */
import { json } from "@sveltejs/kit";
import fs from "fs";
import path from "path";
import { getProjectRoot } from "$lib/server/services/projects";
import { classifyFile, type SemanticRegion } from "$lib/server/agent/segments";
import { SKILL_REGISTRY } from "$lib/server/agent/skills";

function walkSrc(dir: string, out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".") || e.name === "node_modules") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walkSrc(full, out);
        else if (e.name.endsWith(".ts") || e.name.endsWith(".svelte")) out.push(full);
    }
    return out;
}

/**
 * Retourne l'atlas sémantique complet du projet cible :
 *   - régions : fichiers classifiés par région sémantique
 *   - skills   : registre des skills disponibles
 */
export async function GET() {
    try {
        const projectRoot = getProjectRoot();
        const srcDir = path.join(projectRoot, "src");
        const files = walkSrc(srcDir);

        const ALL_REGIONS: SemanticRegion[] = ["ui", "domain", "api", "infra", "store", "tests", "config"];
        const regions: Record<SemanticRegion, { files: string[] }> = {
            ui:     { files: [] },
            domain: { files: [] },
            api:    { files: [] },
            infra:  { files: [] },
            store:  { files: [] },
            tests:  { files: [] },
            config: { files: [] },
        };

        for (const f of files) {
            const rel = path.relative(projectRoot, f).split("\\").join("/");
            const region = classifyFile(rel);
            regions[region].files.push(rel);
        }

        return json({ regions, skills: SKILL_REGISTRY });
    } catch (err: any) {
        return json({ error: err.message }, { status: 500 });
    }
}
