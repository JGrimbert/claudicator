/** Cartographie — retourne les statistiques d'indexation (GET) */
import { json } from "@sveltejs/kit";
import { readFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import { getProjectRoot } from "$lib/server/services/projects";

/** Lit l'index des méthodes depuis le cache */
export async function GET() {
    const projectPath = getProjectRoot();
    const indexPath   = join(projectPath, ".cache/method-index.json");
    const configPath  = join(projectPath, ".cache/lolve-cartography.json");
    const fileIdxPath = join(projectPath, ".cache/file-index.json");

    if (!existsSync(indexPath)) {
        return json({ error: "Index non trouvé — lance annotate index" }, { status: 404 });
    }

    try {
        const index   = JSON.parse(readFileSync(indexPath, "utf-8"));
        const methods = index.methods ?? {};
        const entries = Object.values(methods) as any[];

        const roles: Record<string, number> = {};
        let withDescription = 0;
        let withEffects     = 0;
        let withConsumers   = 0;
        const files = new Set<string>();

        for (const m of entries) {
            const role = m.role ?? "unknown";
            roles[role] = (roles[role] ?? 0) + 1;
            if (m.description)                         withDescription++;
            if (m.effects   && m.effects.length   > 0) withEffects++;
            if (m.consumers && m.consumers.length > 0) withConsumers++;
            if (m.file) files.add(m.file);
        }

        // Timestamp depuis mtime du fichier
        const indexMtime = statSync(indexPath).mtime.toISOString();

        // Config projet
        let model    = null;
        let hasFileIndex = existsSync(fileIdxPath);
        if (existsSync(configPath)) {
            const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
            model = cfg.api?.model ?? null;
        }

        return json({
            methods:         entries.length,
            files:           files.size,
            withDescription,
            withEffects,
            withConsumers,
            roles,
            indexUpdatedAt:  indexMtime,
            hasFileIndex,
            model
        });
    } catch (err: any) {
        return json({ error: err.message }, { status: 500 });
    }
}
