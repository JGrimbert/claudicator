import { json } from "@sveltejs/kit";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";

dotenv.config();

export function GET() {
    const projectPath = process.env.TARGET_PROJECT_PATH ?? "C:/lolve";
    const indexPath   = join(projectPath, ".cache/method-index.json");

    if (!existsSync(indexPath)) {
        return json({ error: "Index non trouvé" }, { status: 404 });
    }

    try {
        const index   = JSON.parse(readFileSync(indexPath, "utf-8"));
        const methods = index.methods ?? {};

        const list = Object.entries(methods).map(([key, m]: [string, any]) => ({
            key,
            file:         m.file        ?? "",
            startLine:    m.startLine   ?? null,
            role:         m.role        ?? "",
            description:  m.description ?? "",
            hasEffects:   Array.isArray(m.effects)   && m.effects.length   > 0,
            hasConsumers: Array.isArray(m.consumers) && m.consumers.length > 0,
        }));

        return json({ methods: list });
    } catch (err: any) {
        return json({ error: err.message }, { status: 500 });
    }
}
