import { json } from "@sveltejs/kit";
import { getProjectRoot } from "$lib/server/services/projects";
import fs from "fs";
import path from "path";

export async function GET({ url }) {
    const filePath = url.searchParams.get("path");
    if (!filePath) return json({ error: "Missing path" }, { status: 400 });

    const root = getProjectRoot();
    const abs = path.resolve(root, filePath);
    const normalizedRoot = path.resolve(root);

    // Sécurité : empêcher toute traversée hors de projectRoot
    if (!abs.startsWith(normalizedRoot + path.sep) && abs !== normalizedRoot) {
        return json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const content = fs.readFileSync(abs, "utf-8");
        return json({ path: filePath, content });
    } catch {
        return json({ error: "Not found" }, { status: 404 });
    }
}
