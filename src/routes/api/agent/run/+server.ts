import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { getTask, updateTask, getTasksDir } from "$lib/server/services/tasks";
import type { TokenUsage } from "$lib/server/services/tasks";
import { register, unregister } from "$lib/server/services/processes";
import { getProjectRoot } from "$lib/server/services/projects";
import { addProjectUsage } from "$lib/server/services/usage";
import { loadMethodSnippets } from "$lib/server/agent/context";
import { formatImplementationPrompt, loadProjectDocs } from "$lib/server/agent/prompt";
import { generateAtlasStrings } from "$lib/server/services/cartography";
import {
    createSession,
    sendTurn,
    isSessionAlive,
    isSessionBusy,
} from "$lib/server/services/claude-session";

function stripAnsi(str: string): string {
    return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').replace(/\x1B\][^\x07]*\x07/g, '').trim();
}

/** Sauvegarde uniquement le texte produit par l'agent (type "agent") dans <taskId>.plan.md. */
function savePlan(taskId: string, lines: string[]) {
    if (lines.length === 0) return;
    try {
        const dir = getTasksDir();
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${taskId}.plan.md`), lines.join("\n"), "utf-8");
    } catch { /* silencieux */ }
}

export async function POST({ request }) {
    const body = await request.json();
    const { prompt: rawPrompt, plan, taskId, projectRoot, isFollowUp } = body;
    const root = projectRoot?.trim() || getProjectRoot();

    // Phase : plan si aucun plan fourni, implémentation sinon, suivi si isFollowUp
    const isImplementationPhase = !!(plan?.trim() && taskId);
    const isSessionPhase = isImplementationPhase || !!(isFollowUp && taskId);

    // Si un plan est fourni, construire le prompt enrichi côté serveur
    let prompt: string = rawPrompt ?? "";
    let contextStats: { methods: number; hasAtlas: boolean } | null = null;
    if (isImplementationPhase && !isFollowUp) {
        const task = getTask(taskId);
        if (task) {
            const planHint = plan.replace(/\n+/g, " ").trim().slice(0, 250);
            const query    = `${task.title} ${planHint}`;
            const methods  = loadMethodSnippets(root, query);
            const docs     = loadProjectDocs(root);
            const atlas    = generateAtlasStrings(root, query)?.compressed;
            contextStats   = { methods: methods?.length ?? 0, hasAtlas: !!(atlas?.trim()) };
            prompt = formatImplementationPrompt(task, plan, methods, docs, atlas);
        } else {
            prompt = plan;
        }
    }

    if (!prompt?.trim()) {
        return new Response(JSON.stringify({ error: "Prompt manquant" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    // Vérification follow-up : la session doit exister
    if (isFollowUp && taskId && !isSessionAlive(taskId)) {
        return new Response(JSON.stringify({ error: "Pas de session active pour cette task" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    // Rejet 409 si session occupée
    if (isSessionPhase && taskId && isSessionBusy(taskId)) {
        return new Response(JSON.stringify({ error: "Session occupée" }), {
            status: 409,
            headers: { "Content-Type": "application/json" }
        });
    }

    if (taskId) {
        const task = getTask(taskId);
        if (!task) {
            return new Response(JSON.stringify({ error: "Task introuvable" }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (isSessionPhase) {
            // Vider les logs sans changer le statut
            updateTask(taskId, { logs: [] });
        } else {
            // Génération du plan : specification → planification
            updateTask(taskId, { status: "planification", logs: [] });
        }
    }

    // Créer la session si nécessaire (premier tour d'implémentation)
    if (isImplementationPhase && taskId && !isSessionAlive(taskId)) {
        createSession(taskId, root, root);
    }

    const encoder = new TextEncoder();
    const allLogs: string[] = [];
    const planLines: string[] = [];
    let capturedUsage: TokenUsage | null = null;

    const stream = new ReadableStream({
        start(controller) {
            const emit = (line: string, type: "agent" | "system" | "usage" | "context" | "session_status" = "agent") => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line, type })}\n\n`));
                } catch { /* stream fermé */ }
                if (type !== "usage" && type !== "context" && type !== "session_status") allLogs.push(line);
                if (type === "agent") planLines.push(line);
            };

            if (isSessionPhase && taskId) {
                // ── Mode session long-lived ──
                if (contextStats) emit(JSON.stringify(contextStats), "context");

                sendTurn(taskId, prompt, (event) => {
                    if (event.type === "agent_text") {
                        emit(event.payload as string, "agent");
                    } else if (event.type === "tool_use") {
                        emit(event.payload as string, "system");
                    } else if (event.type === "stderr") {
                        emit(event.payload as string, "system");
                    } else if (event.type === "usage") {
                        const u = event.payload as { inputTokens: number; outputTokens: number };
                        capturedUsage = u;
                        emit(JSON.stringify(u), "usage");
                    } else if (event.type === "turn_end") {
                        // Mise à jour de la task
                        if (taskId) {
                            const existing = getTask(taskId);
                            if (existing) {
                                const updates: Parameters<typeof updateTask>[1] = { logs: allLogs };
                                // Premier tour impl → avancer le statut
                                if (isImplementationPhase && !isFollowUp) {
                                    updates.status = "documentation";
                                }
                                if (capturedUsage) {
                                    const prev = existing.totalUsage;
                                    updates.usage = capturedUsage;
                                    updates.totalUsage = {
                                        inputTokens: (prev?.inputTokens ?? 0) + capturedUsage.inputTokens,
                                        outputTokens: (prev?.outputTokens ?? 0) + capturedUsage.outputTokens,
                                    };
                                    if (isImplementationPhase && !isFollowUp) {
                                        updates.implUsage = capturedUsage;
                                    }
                                    addProjectUsage(capturedUsage.inputTokens, capturedUsage.outputTokens);
                                }
                                updateTask(taskId, updates);
                            }
                        }
                        // Signaler que la session reste vivante
                        emit("true", "session_status");
                        emit("[✓ tour terminé — session active]", "system");
                        try { controller.close(); } catch { /* déjà fermé */ }
                    } else if (event.type === "error") {
                        emit(`[erreur: ${event.payload}]`, "system");
                        if (taskId) updateTask(taskId, { status: "failed", logs: allLogs });
                        try { controller.close(); } catch { /* déjà fermé */ }
                    }
                });

            } else {
                // ── Mode one-shot (-p) : phase plan ──
                const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;
                const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";
                const proc = spawn(
                    claudeCmd,
                    ["-p", "--verbose", "--dangerously-skip-permissions", "--output-format", "stream-json", "--add-dir", root],
                    { shell: true, windowsHide: true, env: cleanEnv, cwd: root }
                );
                if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }
                if (taskId) register(taskId, proc);
                if (proc.pid) emit(`[pid:${proc.pid}]`, "system");
                if (contextStats) emit(JSON.stringify(contextStats), "context");

                let stdoutBuf = "";
                let stderrBuf = "";
                let resultSubtype: string | null = null;

                proc.stdout.on("data", (chunk: Buffer) => {
                    stdoutBuf += chunk.toString();
                    const lines = stdoutBuf.split("\n");
                    stdoutBuf = lines.pop() ?? "";
                    for (const rawLine of lines) {
                        if (!rawLine.trim()) continue;
                        try {
                            const obj = JSON.parse(rawLine);
                            if (obj.type === "assistant") {
                                const content = obj.message?.content ?? [];
                                for (const block of content) {
                                    if (block.type === "text" && block.text) {
                                        emit(block.text, "agent");
                                    } else if (block.type === "tool_use" && block.name) {
                                        const inp = block.input as Record<string, unknown> | undefined;
                                        const hint = inp ? Object.values(inp).find(v => typeof v === "string") as string | undefined : undefined;
                                        emit(`⚙ ${block.name}${hint ? ` ${hint.slice(0, 80)}` : ""}`, "system");
                                    }
                                }
                            } else if (obj.type === "result") {
                                resultSubtype = obj.subtype ?? null;
                                const u = obj.usage;
                                if (u && (u.input_tokens !== undefined || u.inputTokens !== undefined)) {
                                    capturedUsage = {
                                        inputTokens: u.input_tokens ?? u.inputTokens ?? 0,
                                        outputTokens: u.output_tokens ?? u.outputTokens ?? 0,
                                    };
                                    emit(JSON.stringify(capturedUsage), "usage");
                                }
                            }
                        } catch {
                            emit(rawLine, "agent");
                        }
                    }
                });
                proc.stderr.on("data", (chunk: Buffer) => {
                    stderrBuf += chunk.toString();
                    const lines = stderrBuf.split("\n");
                    stderrBuf = lines.pop() ?? "";
                    lines.forEach(l => {
                        const line = stripAnsi(l);
                        if (!line || line.length < 2) return;
                        emit(line, "system");
                    });
                });
                proc.on("error", (err: Error) => {
                    emit(`[erreur: ${err.message}]`, "system");
                    if (taskId) { unregister(taskId); updateTask(taskId, { status: "failed", logs: allLogs }); }
                    try { controller.close(); } catch { /* déjà fermé */ }
                });
                proc.on("close", (code: number | null) => {
                    if (stdoutBuf.trim()) {
                        try {
                            const obj = JSON.parse(stdoutBuf.trim());
                            if (obj.type === "assistant") {
                                const content = obj.message?.content ?? [];
                                for (const block of content) {
                                    if (block.type === "text" && block.text) emit(block.text, "agent");
                                    else if (block.type === "tool_use" && block.name) {
                                        const inp = block.input as Record<string, unknown> | undefined;
                                        const hint = inp ? Object.values(inp).find(v => typeof v === "string") as string | undefined : undefined;
                                        emit(`⚙ ${block.name}${hint ? ` ${hint.slice(0, 80)}` : ""}`, "system");
                                    }
                                }
                            } else if (obj.type === "result") {
                                resultSubtype = obj.subtype ?? null;
                                const u = obj.usage;
                                if (u && (u.input_tokens !== undefined || u.inputTokens !== undefined)) {
                                    capturedUsage = {
                                        inputTokens: u.input_tokens ?? u.inputTokens ?? 0,
                                        outputTokens: u.output_tokens ?? u.outputTokens ?? 0,
                                    };
                                    emit(JSON.stringify(capturedUsage), "usage");
                                }
                            }
                        } catch {
                            emit(stdoutBuf, "agent");
                        }
                    }
                    if (stderrBuf.trim()) emit(stderrBuf, "system");

                    const success = code === 0 || resultSubtype === "success";
                    const status = success ? "implementation" : "failed";
                    if (taskId) {
                        unregister(taskId);
                        if (success && capturedUsage) {
                            const existing = getTask(taskId);
                            const prev = existing?.totalUsage;
                            const totalUsage: TokenUsage = {
                                inputTokens: (prev?.inputTokens ?? 0) + capturedUsage.inputTokens,
                                outputTokens: (prev?.outputTokens ?? 0) + capturedUsage.outputTokens,
                            };
                            updateTask(taskId, { status, logs: allLogs, usage: capturedUsage, totalUsage, planUsage: capturedUsage });
                            addProjectUsage(capturedUsage.inputTokens, capturedUsage.outputTokens);
                        } else {
                            updateTask(taskId, { status, logs: allLogs });
                        }
                        if (success) savePlan(taskId, planLines);
                    }
                    const msg = success ? "✓ terminé" : `erreur (code ${code})`;
                    emit(`[${msg}]`, "system");
                    try { controller.close(); } catch { /* déjà fermé */ }
                });
            }
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type":  "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive"
        }
    });
}
