import fs from "fs";
import { askClaude } from "../services/claude";
import { getIssue } from "../services/github";
import { getRemoteRepo } from "../services/git";
import { emitLog } from "../logs";

export async function createIssuePlan(issueNumber: number) {

    emitLog("INFO", `Chargement de l'issue #${issueNumber}`);

    const { owner, repo } = await getRemoteRepo();
    emitLog("INFO", `Dépôt détecté : ${owner}/${repo}`);

    const issue = await getIssue(owner, repo, issueNumber);
    emitLog("INFO", `Issue récupérée : ${issue.title}`);

    fs.mkdirSync(".agent/issues", { recursive: true });
    fs.mkdirSync("plans", { recursive: true });

    const issuePath = `.agent/issues/${issueNumber}.md`;

    const text = `
# Issue ${issueNumber}

## Title
${issue.title}

## Description
${issue.body}
`;

    fs.writeFileSync(issuePath, text);
    emitLog("INFO", `Issue sauvegardée dans ${issuePath}`);

    const prompt = `
Lis ce fichier :

${issuePath}

Produit un plan d'implémentation détaillé.
Format markdown.
Ne code pas.
`;

    emitLog("INFO", "Génération du plan avec Claude...");
    const plan = askClaude(prompt);
    emitLog("SUCCESS", "Plan généré");

    const planPath = `plans/issue-${issueNumber}-global.md`;
    fs.writeFileSync(planPath, plan);
    emitLog("INFO", `Plan sauvegardé dans ${planPath}`);

    return {
        planPath,
        plan
    };
}
