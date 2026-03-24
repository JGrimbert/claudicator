/** Tâches — crée la branche initiale et commite le plan (POST) */
import fs from "fs";
import path from "path";
import simpleGit from "simple-git";
import { json } from "@sveltejs/kit";
import { resolveTaskContext, updateTask, getTasksDir } from "$lib/server/services/tasks";
import { createIssueComment } from "$lib/server/services/github";

/** Génère un nom de branche git depuis un titre */
function toBranchName(issueNumber: number | undefined, title: string): string {
    const slug = title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 40)
        .replace(/-+$/, "");
    return issueNumber ? `issue-${issueNumber}-${slug}` : `task-${slug}`;
}

/** Crée la branche initiale pour une tâche */
export async function POST({ params }) {
    const ctx = resolveTaskContext(params.id);
    if (!ctx) return json({ error: "Task introuvable" }, { status: 404 });
    const { task, projectRoot: root } = ctx;
    if (task.branch) return json({ error: "Branche déjà créée", branch: task.branch }, { status: 409 });

    const planPath = path.join(getTasksDir(), `${params.id}.plan.md`);
    if (!fs.existsSync(planPath)) return json({ error: "Plan introuvable" }, { status: 404 });

    const planContent = fs.readFileSync(planPath, "utf-8");
    const branchName = toBranchName(task.issueNumber, task.title);

    try {
        // 1. Créer et checkout la branche dans le projet cible
        const git = simpleGit(root);
        await git.checkoutLocalBranch(branchName);

        // 2. Écrire le plan dans le projet cible
        const plansDir = path.join(root, "plans");
        fs.mkdirSync(plansDir, { recursive: true });
        const planFileName = `issue-${task.issueNumber ?? task.id.slice(0, 8)}-plan.md`;
        const targetPlanPath = path.join(plansDir, planFileName);
        fs.writeFileSync(targetPlanPath, planContent, "utf-8");

        // 3. Commiter le plan
        await git.add([path.join("plans", planFileName)]);
        await git.commit(`plan: #${task.issueNumber ?? ""} ${task.title.slice(0, 60)}`);

        // 4. Commenter l'issue GitHub
        if (task.issueNumber) {
            try {
                await createIssueComment(
                    task.issueNumber,
                    `## Plan généré\n\n\`\`\`\n${planContent}\n\`\`\``
                );
            } catch { /* GitHub peut être indisponible */ }
        }

        // 5. Sauver la branche dans la task
        updateTask(params.id, { branch: branchName });

        return json({ branch: branchName });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, { status: 500 });
    }
}
