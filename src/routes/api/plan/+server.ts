import { json } from "@sveltejs/kit";
import { existsSync, readFileSync } from "fs";

/** Retourne le plan global d'une issue si existant */
export async function GET({ url }) {
    const issue = url.searchParams.get("issue");
    if (!issue) return json({ error: "issue manquant" }, { status: 400 });

    const planPath = `plans/issue-${issue}-global.md`;

    if (!existsSync(planPath)) {
        return json({ exists: false, content: null });
    }

    return json({ exists: true, content: readFileSync(planPath, "utf-8") });
}
