/**
 * /api/roadmap-data
 *
 * GET → sert ai/roadmap.json du projet courant (null si inexistant)
 */
import fs from "fs";
import path from "path";
import { json } from "@sveltejs/kit";
import { getProjectRoot } from "$lib/server/services/projects";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => {
    const projectRoot = getProjectRoot();
    const jsonPath = path.join(projectRoot, "ai", "roadmap.json");

    if (!fs.existsSync(jsonPath)) {
        return json(null, { headers: { "Cache-Control": "no-store" } });
    }

    try {
        return json(JSON.parse(fs.readFileSync(jsonPath, "utf-8")), {
            headers: { "Cache-Control": "no-store" },
        });
    } catch {
        return json(null);
    }
};
