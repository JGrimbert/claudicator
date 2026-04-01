/**
 * POST /api/tasks/[id]/commit-all-patches
 * Pour chaque patch : git apply → git add -A → git commit (message extrait du patch).
 * Évite git am --3way qui crée des merge commits quand le contexte diverge.
 */
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import simpleGit from "simple-git";
import { findTaskGlobal, updateTaskGlobal } from "$lib/server/services/tasks";
import { getAbsPatchesDirFrom, listPatchesFrom } from "$lib/server/services/patches";
import { getProjectRoot } from "$lib/server/services/projects";
import { getMainBranch } from "$lib/server/services/git";

/** Extrait le message de commit depuis l'en-tête d'un git format-patch. */
function extractCommitMessage(content: string): string {
    // Subject: [PATCH 1/7] feat(task): ...  ou  Subject: feat(task): ...
    const m = content.match(/^Subject: (?:\[PATCH[^\]]*\] )?(.+)/m);
    if (!m) return "feat: patch";
    // Le message peut s'étendre sur plusieurs lignes (continuation indentée)
    let msg = m[1];
    const rest = content.slice(content.indexOf(m[0]) + m[0].length);
    for (const line of rest.split("\n")) {
        if (/^ /.test(line)) msg += " " + line.trim();
        else break;
    }
    return msg.trim();
}

export const POST: RequestHandler = async ({ params }) => {
    const found = findTaskGlobal(t => t.id === params.id);
    if (!found) throw error(404, "Task introuvable");

    const { task, tasksDir } = found;
    const patchesDir = getAbsPatchesDirFrom(tasksDir, task.id);
    const patches = listPatchesFrom(tasksDir, task.id)
        .sort((a, b) => (a.issueNumber ?? 0) - (b.issueNumber ?? 0));

    if (!patches.length) throw error(400, "Aucun patch disponible");

    const root = getProjectRoot();

    const stream = new ReadableStream({
        start(controller) {
            const enc = new TextEncoder();
            const send = (obj: object) => {
                try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* fermé */ }
            };

            (async () => {
                try {
                    // ── Branche ────────────────────────────────────────────────────────────
                    let branchName = task.branch ?? "";
                    if (!branchName) {
                        const kw = task.fullPlanId?.match(/^stack-full-(.+)-\d+$/)?.[1]
                            ?? task.title.replace(/^Plan complet — /, "").replace(/\s*\(.*/, "")
                                .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
                        branchName = `fullplan-${kw}`;

                        const git = simpleGit(root);
                        const main = await getMainBranch(root);
                        await git.checkout(main);
                        const locals = await git.branchLocal();
                        if (locals.all.includes(branchName)) {
                            await git.checkout(branchName);
                        } else {
                            await git.checkoutLocalBranch(branchName);
                        }
                        updateTaskGlobal(task.id, { branch: branchName });
                        send({ type: "branch", name: branchName });
                    }

                    // ── apply + commit par patch ───────────────────────────────────────────
                    const git = simpleGit(root);
                    for (let i = 0; i < patches.length; i++) {
                        const p = patches[i];
                        const patchPath = path.resolve(patchesDir, p.name);
                        const patchContent = fs.readFileSync(patchPath, "utf-8");
                        const commitMsg = extractCommitMessage(patchContent);
                        send({ type: "applying", patch: p.name, index: i + 1, total: patches.length });

                        // Essai 1 : apply direct
                        let applied = false;
                        try {
                            execFileSync("git", ["-C", root, "apply", "--ignore-whitespace", "--ignore-space-change", patchPath], { stdio: "pipe" });
                            applied = true;
                        } catch { /* essai 2 */ }

                        // Essai 2 : apply --3way (résolution de conflits sans merge commit)
                        if (!applied) {
                            try {
                                execFileSync("git", ["-C", root, "apply", "--3way", "--ignore-whitespace", "--ignore-space-change", patchPath], { stdio: "pipe" });
                                applied = true;
                            } catch (e) {
                                const stderr = (e as NodeJS.ErrnoException & { stderr?: Buffer }).stderr?.toString() ?? String(e);
                                // Nettoyer l'état partiel
                                try { execFileSync("git", ["-C", root, "checkout", "."], { stdio: "pipe" }); } catch { /* best-effort */ }
                                send({ type: "error", patch: p.name, message: stderr.trim().slice(0, 400) });
                                controller.close();
                                return;
                            }
                        }

                        // Commit avec le message extrait du patch
                        await git.add(["-A"]);
                        await git.commit(commitMsg);
                        send({ type: "applied", patch: p.name });
                    }

                    updateTaskGlobal(task.id, { status: "validation" });
                    send({ type: "done", branch: branchName, total: patches.length });
                } catch (e) {
                    send({ type: "error", message: String(e) });
                }
                controller.close();
            })();
        }
    });

    return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
};
