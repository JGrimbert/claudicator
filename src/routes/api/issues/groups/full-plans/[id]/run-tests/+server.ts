import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { getFullPlan } from "$lib/server/services/fullPlans";
import { findTaskGlobal } from "$lib/server/services/tasks";
import { getAbsPatchesDirFrom, getPatchContentFrom } from "$lib/server/services/patches";
import { getProjectRoot } from "$lib/server/services/projects";

/**
 * POST /api/issues/groups/full-plans/[id]/run-tests
 * Body: { issueNumber: number, patchName: string }
 *
 * Si le worktree est absent mais que le patch contient des tests :
 *   1. Recrée le worktree depuis le repo cible
 *   2. Applique tous les patches dans l'ordre (git am)
 *   3. Lance les tests
 *
 * Events SSE:
 *   data: { type: "out"|"sys", line: string }
 *   data: { type: "exit", code: number }
 */
export const POST: RequestHandler = async ({ params, request }) => {
    const plan = getFullPlan(params.id);
    if (!plan) throw error(404, "Plan introuvable");

    const body = await request.json() as { issueNumber: number; patchName: string };
    if (!body.issueNumber || !body.patchName) throw error(400, "issueNumber et patchName requis");

    const found = findTaskGlobal(t => t.fullPlanId === params.id);
    if (!found) throw error(400, "Aucune task liée à ce plan");
    const { task: linkedTask, tasksDir } = found;

    const patchContent = getPatchContentFrom(tasksDir, linkedTask.id, body.patchName);
    if (!patchContent) throw error(404, "Patch introuvable");

    // Extraire les chemins de fichiers test depuis le patch
    const testFilesRaw = [...patchContent.matchAll(/\+\+\+ b\/(.*\.(test|spec)\.(ts|js|tsx|jsx|vue|svelte))/g)].map(m => m[1]);

    // Trouver le répertoire d'exécution (worktree ou fallback root)
    const worktreesBase = path.join(process.cwd(), ".agent", "worktrees");
    let cwd = path.join(worktreesBase, `fullplan-${plan.id}`);
    if (!fs.existsSync(cwd)) {
        const dirs = fs.existsSync(worktreesBase)
            ? fs.readdirSync(worktreesBase).filter(d => d.startsWith(`fullplan-${plan.id}`))
            : [];
        cwd = dirs.length > 0 ? path.join(worktreesBase, dirs[0]) : path.join(worktreesBase, `fullplan-${plan.id}`);
    }

    const patchesDir = getAbsPatchesDirFrom(tasksDir, linkedTask.id);

    function stripAnsi(s: string): string {
        return s.replace(/\x1B\[[0-9;]*[mGKHF]/g, "").replace(/\x1B\][^\x07]*\x07/g, "");
    }

    const stream = new ReadableStream({
        async start(controller) {
            const enc = new TextEncoder();
            const send = (obj: object) => {
                try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* fermé */ }
            };
            const close = () => { try { controller.close(); } catch { /* déjà fermé */ } };

            // ── Reconstruction du worktree si nécessaire ──────────────────────
            let resolvedCwd = cwd;
            let testFiles = testFilesRaw.filter(f => fs.existsSync(path.join(resolvedCwd, f)));

            if (testFilesRaw.length > 0 && testFiles.length === 0) {
                send({ type: "sys", line: "Worktree absent — reconstruction en cours…" });

                const root = getProjectRoot();

                // Chercher une branche existante (run global ou stack-spécifique)
                let worktreeBranch: string | null = null;
                try {
                    const out = execSync(
                        `git -C "${root}" branch --list "fullplan-${plan.id}*" --format="%(refname:short)"`,
                        { stdio: "pipe" }
                    ).toString().trim();
                    if (out) worktreeBranch = out.split("\n")[0].trim();
                } catch { /* ignore */ }

                try {
                    fs.mkdirSync(worktreesBase, { recursive: true });

                    if (worktreeBranch) {
                        send({ type: "sys", line: `Branche existante : ${worktreeBranch}` });
                        execSync(`git -C "${root}" worktree add "${resolvedCwd}" "${worktreeBranch}"`, { stdio: "pipe" });
                    } else {
                        const newBranch = `fullplan-${plan.id}`;
                        send({ type: "sys", line: `Nouvelle branche : ${newBranch}` });
                        execSync(`git -C "${root}" worktree add "${resolvedCwd}" -b "${newBranch}"`, { stdio: "pipe" });
                        worktreeBranch = newBranch;
                    }
                    send({ type: "sys", line: `Worktree créé : ${resolvedCwd}` });

                    // Appliquer tous les patches dans l'ordre
                    if (fs.existsSync(patchesDir)) {
                        const patches = fs.readdirSync(patchesDir)
                            .filter(f => f.endsWith(".patch"))
                            .sort(); // issue-132.patch avant issue-154.patch

                        for (const patchFile of patches) {
                            const patchPath = path.join(patchesDir, patchFile);
                            send({ type: "sys", line: `Applying ${patchFile}…` });
                            try {
                                execSync(`git -C "${resolvedCwd}" am "${patchPath}"`, { stdio: "pipe" });
                                send({ type: "sys", line: `  ✓ ${patchFile}` });
                            } catch {
                                // git am échoue (conflits, whitespace…) → tenter git apply
                                try { execSync(`git -C "${resolvedCwd}" am --abort`, { stdio: "pipe" }); } catch { /* ignore */ }
                                try {
                                    execSync(`git -C "${resolvedCwd}" apply "${patchPath}"`, { stdio: "pipe" });
                                    execSync(`git -C "${resolvedCwd}" add -A`, { stdio: "pipe" });
                                    execSync(`git -C "${resolvedCwd}" commit --allow-empty -m "apply ${patchFile}"`, { stdio: "pipe" });
                                    send({ type: "sys", line: `  ✓ ${patchFile} (via git apply)` });
                                } catch (e2: any) {
                                    send({ type: "sys", line: `  ✗ ${patchFile} : ${e2.message?.split("\n")[0]}` });
                                }
                            }
                        }
                    }

                    // Re-vérifier les fichiers test
                    testFiles = testFilesRaw.filter(f => fs.existsSync(path.join(resolvedCwd, f)));
                    if (testFiles.length === 0) {
                        send({ type: "sys", line: "Fichiers test introuvables même après reconstruction." });
                        send({ type: "exit", code: 1 });
                        close();
                        return;
                    }
                    send({ type: "sys", line: `${testFiles.length} fichier(s) test prêt(s)` });

                } catch (e: any) {
                    send({ type: "sys", line: `[erreur reconstruction] ${e.message?.split("\n")[0]}` });
                    send({ type: "exit", code: 1 });
                    close();
                    return;
                }
            }

            // ── Détecter le runner de test ────────────────────────────────────
            const vitestBin = path.join(resolvedCwd, "node_modules", ".bin", "vitest");
            const jestBin   = path.join(resolvedCwd, "node_modules", ".bin", "jest");
            let cmd: string;
            let args: string[];

            if (fs.existsSync(vitestBin) || fs.existsSync(vitestBin + ".cmd")) {
                cmd = "npx"; args = ["vitest", "run", "--reporter=verbose", "--passWithNoTests", ...testFiles];
            } else if (fs.existsSync(jestBin) || fs.existsSync(jestBin + ".cmd")) {
                cmd = "npx"; args = ["jest", "--verbose", ...testFiles];
            } else {
                cmd = "npm"; args = ["test", "--", ...testFiles];
            }

            send({ type: "sys", line: `$ ${cmd} ${args.join(" ")}` });
            if (testFiles.length === 0) send({ type: "sys", line: "(aucun fichier test dans ce patch)" });

            const proc = spawn(cmd, args, {
                shell: true, windowsHide: true, cwd: resolvedCwd,
                env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" }
            });

            let outBuf = "";
            let errBuf = "";

            proc.stdout?.on("data", (chunk: Buffer) => {
                outBuf += chunk.toString();
                const lines = outBuf.split("\n");
                outBuf = lines.pop() ?? "";
                for (const l of lines) {
                    const line = stripAnsi(l);
                    if (line.trim()) send({ type: "out", line });
                }
            });
            proc.stderr?.on("data", (chunk: Buffer) => {
                errBuf += chunk.toString();
                const lines = errBuf.split("\n");
                errBuf = lines.pop() ?? "";
                for (const l of lines) {
                    const line = stripAnsi(l);
                    if (line.trim()) send({ type: "out", line });
                }
            });
            proc.on("close", (code) => {
                if (outBuf.trim()) send({ type: "out", line: stripAnsi(outBuf) });
                if (errBuf.trim()) send({ type: "out", line: stripAnsi(errBuf) });
                send({ type: "exit", code: code ?? 1 });
                close();
            });
            proc.on("error", (e) => {
                send({ type: "sys", line: `[erreur] ${e.message}` });
                send({ type: "exit", code: 1 });
                close();
            });
        }
    });

    return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
};
