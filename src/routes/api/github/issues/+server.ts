import { json } from "@sveltejs/kit";
import { createIssue } from "$lib/server/services/github";
import dotenv from "dotenv";

dotenv.config();

export async function POST({ request }) {
    const { title, body } = await request.json();
    if (!title?.trim()) return json({ error: "Titre manquant" }, { status: 400 });

    const owner = process.env.TARGET_OWNER!;
    const repo  = process.env.TARGET_REPO!;

    const issue = await createIssue(owner, repo, title.trim(), body ?? "");
    return json({ number: issue.number, title: issue.title }, { status: 201 });
}
