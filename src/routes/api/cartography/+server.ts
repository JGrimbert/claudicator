/** Cartographie — recherche sémantique dans le projet (POST) */
import { json } from "@sveltejs/kit";
import { execSync } from "child_process";
import { resolve } from "path";
import { getProjectRoot } from "$lib/server/services/projects";
import { getProjectConfig } from "$lib/server/services/project-config";

/** Recherche dans la cartographie du projet via script */
export async function POST({ request }) {
    const { query } = await request.json();

    if (!query?.trim()) {
        return json({ error: "Query manquant" }, { status: 400 });
    }

    const projectPath    = getProjectRoot();
    const cartoPath      = process.env.CARTOGRAPHY_PATH     ?? "C:/lolve-cartography";
    const scriptPath     = resolve("scripts/cartography-search.cjs");
    const config         = getProjectConfig();

    try {
        const escaped = query.replace(/"/g, '\\"');
        const output = execSync(
            `node "${scriptPath}" "${escaped}"`,
            {
                encoding: "utf-8",
                maxBuffer: 1024 * 1024 * 10,
                env: {
                    ...process.env,
                    LC_PROJECT_PATH:           projectPath,
                    CARTOGRAPHY_PATH:          cartoPath,
                    LC_IGNORE_DIRS:            JSON.stringify(config.extraIgnoreDirs),
                    LC_COMMENT_ONLY_KEYWORDS:  JSON.stringify(config.commentOnlyKeywords),
                }
            }
        );

        const data = JSON.parse(output);

        if (data.error) {
            return json({ error: data.error }, { status: 500 });
        }

        return json({
            results:      data.results      ?? [],
            grepResults:  data.grepResults  ?? [],
            grepMethods:  data.grepMethods  ?? [],
        });
    } catch (err: any) {
        console.error("[/api/cartography]", err.message);
        return json({ error: err.message }, { status: 500 });
    }
}
