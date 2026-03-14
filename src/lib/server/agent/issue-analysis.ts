import { execFileSync } from "child_process";

export type IssueInput = {
    number: number;
    title: string;
    body: string | null;
    labels: string[];
    updatedAt: string;
    subIssues?: number[];
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
        return body.slice(0, BODY_LIMIT) + "…";
    }
}

export type PreparedIssue = IssueInput & { preparedBody: string; potentialDuplicate?: number };

/** Calcule le coefficient de Jaccard entre les mots de deux titres. */
function jaccardWords(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    if (union.size === 0) return 0;
    return intersection.size / union.size;
}

/** Détecte les doublons potentiels par comparaison Jaccard des titres (> 0.5). */
export function detectPotentialDuplicates(issues: IssueInput[]): Map<number, number> {
    const result = new Map<number, number>();
    for (let i = 0; i < issues.length; i++) {
        for (let j = i + 1; j < issues.length; j++) {
            if (!result.has(issues[j].number)) {
                const score = jaccardWords(issues[i].title, issues[j].title);
                if (score > 0.5) result.set(issues[j].number, issues[i].number);
            }
        }
    }
    return result;
}

/** Prépare les issues en résumant les bodies trop longs et en détectant les doublons. */
export async function prepareIssues(issues: IssueInput[]): Promise<PreparedIssue[]> {
    const toSummarize = issues.filter(i => (i.body?.length ?? 0) > BODY_LIMIT);

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

    const dupeMap = detectPotentialDuplicates(issues);

    return issues.map(issue => ({
        ...issue,
        preparedBody: summaryMap.has(issue.number)
            ? summaryMap.get(issue.number)!
            : (issue.body ?? "(pas de description)"),
        potentialDuplicate: dupeMap.get(issue.number),
    }));
}

/** Injecte la section DIAGRAMME FONDATEUR dans un tableau de lignes, avant FORMAT DE SORTIE. */
function injectDiagram(lines: string[], diagram: string | null | undefined): void {
    if (!diagram) return;
    lines.push("DIAGRAMME FONDATEUR");
    lines.push(diagram);
    lines.push("");
}

/** Construit le prompt d'analyse à partir de la liste enrichie. */
export function buildAnalysisPrompt(
    issues: PreparedIssue[],
    diagram?: string | null
): string {
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
    const hasDupes = issues.some(i => i.potentialDuplicate !== undefined);
    if (hasDupes) lines.push("- Si doublon confirmé, placer les issues concernées dans le même groupe avec note");
    lines.push("");

    injectDiagram(lines, diagram);

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
        const dupeNote = issue.potentialDuplicate ? ` (doublon potentiel de #${issue.potentialDuplicate})` : "";
        lines.push(`#${issue.number} — ${issue.title}${dupeNote}`);
        if (issue.subIssues && issue.subIssues.length > 0) {
            lines.push(`  Sub-issues : ${issue.subIssues.map(n => `#${n}`).join(", ")}`);
        }
        if (issue.labels.length > 0) lines.push(`Labels : ${issue.labels.join(", ")}`);
        lines.push(`Description : ${issue.preparedBody}`);
        lines.push("");
    }

    return lines.join("\n");
}

/** Construit un prompt pour intégrer des issues nouvelles/modifiées dans une analyse existante. */
export function buildUpdatePrompt(
    existingAnalysis: string,
    newIssues: PreparedIssue[],
    diagram?: string | null
): string {
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

    injectDiagram(lines, diagram);

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
        const dupeNote = issue.potentialDuplicate ? ` (doublon potentiel de #${issue.potentialDuplicate})` : "";
        lines.push(`#${issue.number} — ${issue.title}${dupeNote}`);
        if (issue.subIssues && issue.subIssues.length > 0) {
            lines.push(`  Sub-issues : ${issue.subIssues.map(n => `#${n}`).join(", ")}`);
        }
        if (issue.labels.length > 0) lines.push(`Labels : ${issue.labels.join(", ")}`);
        lines.push(`Description : ${issue.preparedBody}`);
        lines.push("");
    }

    return lines.join("\n");
}

/** Construit un prompt de raffinement de roadmap existante à partir d'un message utilisateur. */
export function buildChatPrompt(existingAnalysis: string, message: string): string {
    const lines: string[] = [];
    lines.push("TASK");
    lines.push("Raffinement de la roadmap");
    lines.push("");
    lines.push("OBJECTIF");
    lines.push("Intègre la demande dans la roadmap existante, produis la version complète mise à jour.");
    lines.push("");
    lines.push("ANALYSE EXISTANTE");
    lines.push(existingAnalysis);
    lines.push("");
    lines.push("DEMANDE");
    lines.push(message);
    return lines.join("\n");
}

/** Construit un prompt de raffinement ciblé sur un groupe spécifique. */
export function buildFocusedPrompt(
    existingAnalysis: string,
    groupName: string,
    issueNumbers: number[],
    instruction: string
): string {
    const lines: string[] = [];
    lines.push("TASK");
    lines.push("Raffinement ciblé de la roadmap");
    lines.push("");
    lines.push("OBJECTIF");
    lines.push(`Approfondis le groupe "${groupName}" (issues ${issueNumbers.map(n => `#${n}`).join(", ")}) dans la roadmap existante.`);
    lines.push("Produis la version complète mise à jour.");
    lines.push("");
    lines.push("ANALYSE EXISTANTE");
    lines.push(existingAnalysis);
    lines.push("");
    lines.push("INSTRUCTION");
    lines.push(instruction);
    return lines.join("\n");
}
