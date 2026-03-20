import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import Anthropic from "@anthropic-ai/sdk";

/**
 * POST /api/issues/groups/haikus
 * Body: { groups: { keyword: string; keywords: string[]; issueTitles: string[] }[] }
 *
 * Pour chaque groupe, appelle Claude Haiku pour générer un titre court et une description.
 * Retourne : { haikus: Record<keyword, { title: string, description: string } | { err: string }> }
 */
export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json();
    const groups: { keyword: string; keywords: string[]; issueTitles: string[] }[] = body.groups ?? [];

    if (groups.length === 0) {
        throw error(400, "groups requis");
    }

    const client = new Anthropic();
    const haikus: Record<string, { title: string; description: string } | { err: string }> = {};

    await Promise.all(groups.map(async (group) => {
        const list = group.issueTitles.map(t => `- ${t}`).join("\n");
        const prompt = `Tu es un assistant de synthèse de projet.
Voici un groupe d'issues liées par le mot-clé "${group.keyword}" :
${list}

Génère un titre court (3-5 mots) et une description (1 phrase) qui résument l'intention de ce groupe.
Réponds uniquement en JSON valide : { "title": "...", "description": "..." }`;

        try {
            const message = await client.messages.create({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 256,
                messages: [{ role: "user", content: prompt }]
            });
            const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("Réponse JSON introuvable");
            const parsed = JSON.parse(match[0]);
            haikus[group.keyword] = {
                title: parsed.title ?? "",
                description: parsed.description ?? ""
            };
        } catch (e) {
            haikus[group.keyword] = { err: e instanceof Error ? e.message : String(e) };
        }
    }));

    return json({ haikus });
};
