import { execFileSync } from "child_process";

export type IssueInput = {
    number: number;
    title: string;
    body: string | null;
    labels: string[];
    updatedAt: string;
};

const BODY_LIMIT = 1500;
const SUMMARY_CONCURRENCY = 5;

/** Appelle claude -p pour résumer un body d'issue trop long. */
export function summarizeIssueBody(body: string): string {
    const prompt = [
        "Résume le texte suivant en 3 à 5 phrases claires et concises.",
        "Conserve les contraintes techniques, les dépendances et les cas limites importants.",
        "Ne produis que le résumé, sans introduction ni titre.",
        "",
        body.slice(0, 8000),
    ].join("\n");

    const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;

    try {
        const result = execFileSync(
            "claude",
            ["-p", "--dangerously-skip-permissions"],
            { input: prompt, env: cleanEnv as NodeJS.ProcessEnv, encoding: "utf-8", shell: true, timeout: 60_000 }
        );
        return result.trim();
    } catch {
        // Fallback : troncature si claude échoue
        return body.slice(0, BODY_LIMIT) + "…";
    }
}

/** Prépare les issues en résumant les bodies trop longs (en parallèle, max 5). */
export async function prepareIssues(issues: IssueInput[]): Promise<Array<IssueInput & { preparedBody: string }>> {
    const results: Array<IssueInput & { preparedBody: string }> = [];
    const toSummarize = issues.filter(i => (i.body?.length ?? 0) > BODY_LIMIT);
    const noSummary   = issues.filter(i => (i.body?.length ?? 0) <= BODY_LIMIT);

    // Traitement séquentiel par batch de SUMMARY_CONCURRENCY
    const batches: IssueInput[][] = [];
    for (let i = 0; i < toSummarize.length; i += SUMMARY_CONCURRENCY) {
        batches.push(toSummarize.slice(i, i + SUMMARY_CONCURRENCY));
    }

    const summaryMap = new Map<number, string>();
    for (const batch of batches) {
        await Promise.all(batch.map(async issue => {
            const summary = await Promise.resolve(summarizeIssueBody(issue.body!));
            summaryMap.set(issue.number, summary);
        }));
    }

    for (const issue of issues) {
        results.push({
            ...issue,
            preparedBody: summaryMap.has(issue.number)
                ? summaryMap.get(issue.number)!
                : (issue.body ?? "(pas de description)"),
        });
    }

    return results;
}

export type PreparedIssue = IssueInput & { preparedBody: string };

/** Construit un prompt pour intégrer des issues nouvelles/modifiées dans une analyse existante. */
export function buildUpdatePrompt(existingAnalysis: string, newIssues: PreparedIssue[]): string {
    const lines: string[] = [];

    lines.push("TASK");
    lines.push("Mise à jour de l'analyse des issues GitHub");
    lines.push("");
    lines.push("OBJECTIF");
    lines.push("Tu disposes d'une analyse existante (groupes thématiques + roadmap Mermaid).");
    lines.push("Intègre les nouvelles issues ou les issues modifiées listées ci-dessous dans cette analyse.");
    lines.push("Produis une version mise à jour complète en conservant la structure existante.");
    lines.push("");
    lines.push("CONTRAINTES");
    lines.push("- Conserver les groupes existants autant que possible");
    lines.push("- Placer chaque nouvelle issue dans le groupe le plus pertinent");
    lines.push("- Créer un nouveau groupe uniquement si vraiment nécessaire");
    lines.push("- Mettre à jour le diagramme Mermaid si de nouveaux groupes apparaissent");
    lines.push("- Pas de notion de temps ou de durée");
    lines.push("- Garder les titres des groupes courts (3-4 mots max)");
    lines.push("");
    lines.push("FORMAT DE SORTIE");
    lines.push("Reproduire exactement la structure :");
    lines.push("## Analyse thématique");
    lines.push("### Groupe N — Nom");
    lines.push("Issues : #X, #Y");
    lines.push("Résumé : <1 phrase>");
    lines.push("Dépend de : <Groupe X si applicable>");
    lines.push("");
    lines.push("## Roadmap recommandée");
    lines.push("```mermaid");
    lines.push("graph TD");
    lines.push("  G1[Nom1] --> G2[Nom2]");
    lines.push("```");
    lines.push("");
    lines.push("ANALYSE EXISTANTE");
    lines.push(existingAnalysis);
    lines.push("");
    lines.push("NOUVELLES ISSUES À INTÉGRER");

    for (const issue of newIssues) {
        lines.push(`#${issue.number} — ${issue.title}`);
        if (issue.labels.length > 0) lines.push(`Labels : ${issue.labels.join(", ")}`);
        lines.push(`Description : ${issue.preparedBody}`);
        lines.push("");
    }

    return lines.join("\n");
}

/** Construit le prompt d'analyse à partir de la liste enrichie. */
export function buildAnalysisPrompt(issues: Array<IssueInput & { preparedBody: string }>): string {
    const lines: string[] = [];

    lines.push("TASK");
    lines.push("Analyse et organisation des issues GitHub");
    lines.push("");
    lines.push("OBJECTIF");
    lines.push("Analyser les issues listées ci-dessous et produire :");
    lines.push("1. Un regroupement thématique (5 groupes max)");
    lines.push("2. Un ordre d'implémentation recommandé (dépendances logiques)");
    lines.push("3. Un diagramme Mermaid graph TD représentant l'ordre");
    lines.push("");
    lines.push("CONTRAINTES");
    lines.push("- Pas de notion de temps ou de durée");
    lines.push("- Grouper par logique fonctionnelle (infrastructure, UI, agent, intégration…)");
    lines.push("- Identifier les dépendances entre groupes");
    lines.push("- Garder les titres des groupes courts (3-4 mots max)");
    lines.push("- Inclure tous les numéros d'issues dans au moins un groupe");
    lines.push("");
    lines.push("FORMAT DE SORTIE");
    lines.push("## Analyse thématique");
    lines.push("### Groupe N — Nom");
    lines.push("Issues : #X, #Y");
    lines.push("Résumé : <1 phrase>");
    lines.push("Dépend de : <Groupe X si applicable>");
    lines.push("");
    lines.push("## Roadmap recommandée");
    lines.push("```mermaid");
    lines.push("graph TD");
    lines.push("  G1[Nom1] --> G2[Nom2]");
    lines.push("```");
    lines.push("");
    lines.push("ISSUES");

    for (const issue of issues) {
        lines.push(`#${issue.number} — ${issue.title}`);
        if (issue.labels.length > 0) lines.push(`Labels : ${issue.labels.join(", ")}`);
        lines.push(`Description : ${issue.preparedBody}`);
        lines.push("");
    }

    return lines.join("\n");
}
