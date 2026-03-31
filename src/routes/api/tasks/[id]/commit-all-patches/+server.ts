/**
 * POST /api/tasks/[id]/commit-all-patches
 * Applique chaque patch du fullplan via `git am` et crée un commit par patch.
 * Streame la progression en SSE.
 */
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { execFileSync } from "child_process";
import path from "path";
import simpleGit from "simple-git";
import { findTaskGlobal, updateTaskGlobal } from "$lib/server/services/tasks";
import { getAbsPatchesDirFrom, listPatchesFrom } from "$lib/server/services/patches";
import { getProjectRoot } from "$lib/server/services/projects";
import { getMainBranch } from "$lib/server/services/git";

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
                        // Extraire keyword depuis fullPlanId : "stack-full-task-17..." → "task"
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

                    // ── git am par patch ───────────────────────────────────────────────────
                    for (let i = 0; i < patches.length; i++) {
                        const p = patches[i];
                        const patchPath = path.resolve(patchesDir, p.name);
                        send({ type: "applying", patch: p.name, index: i + 1, total: patches.length });

                        let applied = false;
                        // Essai 1 : am direct
                        try {
                            execFileSync("git", ["-C", root, "am", "--ignore-whitespace", patchPath], { stdio: "pipe" });
                            applied = true;
                        } catch {
                            try { execFileSync("git", ["-C", root, "am", "--abort"], { stdio: "pipe" }); } catch { /* best-effort */ }
                        }
                        // Essai 2 : am --3way (merge 3 voies si contexte décalé)
                        if (!applied) {
                            try {
                                execFileSync("git", ["-C", root, "am", "--3way", "--ignore-whitespace", patchPath], { stdio: "pipe" });
                                applied = true;
                            } catch (e) {
                                const stderr = (e as NodeJS.ErrnoException & { stderr?: Buffer }).stderr?.toString() ?? String(e);
                                try { execFileSync("git", ["-C", root, "am", "--abort"], { stdio: "pipe" }); } catch { /* best-effort */ }
                                send({ type: "error", patch: p.name, message: stderr.trim().slice(0, 400) });
                                controller.close();
                                return;
                            }
                        }
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
