import { json } from "@sveltejs/kit";
import { getRepoFile } from "$lib/server/services/github";
import dotenv from "dotenv";

dotenv.config();

export async function GET({ url }) {
    const path = url.searchParams.get("path");
    if (!path) return json({ error: "path manquant" }, { status: 400 });

    const owner = process.env.TARGET_OWNER!;
    const repo = process.env.TARGET_REPO!;

    try {
        const content = await getRepoFile(owner, repo, path);
        return json({ content });
    } catch (err: any) {
        return json({ error: err.message }, { status: 404 });
    }
}
