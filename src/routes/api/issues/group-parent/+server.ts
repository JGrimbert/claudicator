import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentProject } from "$lib/server/services/projects";
import { getIssue, createIssue, addSubIssue } from "$lib/server/services/github";

/**
 * Génère le prompt pour Haiku afin de créer le titre et la description de l'issue parente.
 */
function buildHaikuPrompt(keyword: string, issues: { number: number; title: string }[]): string {
    const list = issues.map(i => `- #${i.number} : ${i.title}`).join("\n");
    return `Tu es un assistant de gestion de projet GitHub.
Voici un groupe d'issues liées par le mot-clé "${keyword}" :
${list}

Génère :
1. Un titre court (< 60 caractères) pour une issue parente qui regroupe ces issues
2. Une description Markdown (3-5 phrases) expliquant le thème commun et listant les sous-issues avec #numéro

FORMAT :
TITRE: <titre>
DESCRIPTION:
<description markdown>`;
}

/**
 * Parse la réponse Haiku pour extraire le titre et la description.
 */
function parseHaikuResponse(text: string): { title: string; body: string } {
    const titleMatch = text.match(/TITRE:\s*(.+)/);
    const descMatch  = text.match(/DESCRIPTION:\s*([\s\S]+)/);
    const title = titleMatch?.[1]?.trim() ?? "Regroupement d'issues";
    const body  = descMatch?.[1]?.trim()  ?? text.trim();
    return { title, body };
}

/**
 * POST /api/issues/group-parent
 * Body: { keyword: string, issueNumbers: number[] }
 *
 * 1. Charge les issues concernées pour récupérer leur id numérique GitHub
 * 2. Appelle Haiku pour générer titre + description
 * 3. Crée l'issue parente sur GitHub
 * 4. Attache chaque issue enfant comme sub-issue
 * 5. Retourne { parentNumber, title, body, html_url }
 */
export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json();
    const keyword: string   = body.keyword ?? "";
    const issueNumbers: number[] = body.issueNumbers ?? [];

    if (!keyword || issueNumbers.length < 2) {
        throw error(400, "keyword et issueNumbers (≥ 2) requis");
    }

    const project = getCurrentProject();
    const owner = project?.owner ?? process.env.TARGET_OWNER!;
    const repo  = project?.repo  ?? process.env.TARGET_REPO!;

    // Charger les issues pour obtenir le titre et l'id numérique GitHub
    const issueDetails = await Promise.all(
        issueNumbers.map(n => getIssue(owner, repo, n))
    );
    const issueList = issueDetails.map(i => ({ number: i.number, title: i.title, id: i.id }));

    // Appel Haiku
    let parentTitle: string;
    let parentBody: string;
    try {
        const client = new Anthropic();
        const message = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 512,
            messages: [{ role: "user", content: buildHaikuPrompt(keyword, issueList) }]
        });
        const raw = message.content[0].type === "text" ? message.content[0].text : "";
        const parsed = parseHaikuResponse(raw);
        parentTitle = parsed.title;
        parentBody  = parsed.body;
    } catch (e) {
        throw error(502, `Erreur Haiku : ${e instanceof Error ? e.message : String(e)}`);
    }

    // Créer l'issue parente sur GitHub
    let parentIssue: Awaited<ReturnType<typeof createIssue>>;
    try {
        parentIssue = await createIssue(owner, repo, parentTitle, parentBody);
    } catch (e) {
        throw error(502, `Erreur création issue : ${e instanceof Error ? e.message : String(e)}`);
    }

    // Attacher chaque issue enfant comme sub-issue
    const failures: number[] = [];
    for (const child of issueList) {
        try {
            await addSubIssue(owner, repo, parentIssue.number, child.id);
        } catch {
            failures.push(child.number);
        }
    }

    return json({
        parentNumber: parentIssue.number,
        title: parentIssue.title,
        body: parentIssue.body,
        html_url: parentIssue.html_url,
        failures,
    });
};
