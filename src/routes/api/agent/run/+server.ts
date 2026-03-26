/** Agent — lance Claude en SSE, sauvegarde le plan (POST) */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { getTask, updateTask, getTasksDir } from "$lib/server/services/tasks";
import type { TokenUsage } from "$lib/server/services/tasks";
import { register, unregister, killProcess, isRunning, getLogBus, clearLogBus } from "$lib/server/services/processes";
import { getProjectRoot } from "$lib/server/services/projects";
import { addProjectUsage } from "$lib/server/services/usage";
import { loadMethodSnippets } from "$lib/server/agent/context";
import { formatImplementationPrompt, loadProjectDocs } from "$lib/server/agent/prompt";
import { ensureAtlasMd } from "$lib/server/agent/atlas";
import { orchestrate } from "$lib/server/agent/orchestrator";
import {
    isSessionAlive,
    isSessionBusy,
    sendTurn,
    destroySession,
} from "$lib/server/services/claude-session";

const SSE_HEADERS = {
    "Content-Type":  "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection":    "keep-alive",
} as const;

/** Supprime les séquences d'échappement ANSI d'une chaîne */
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

type EmitFn = (line: string, type: string) => void;

type OneShotState = {
    capturedUsage: TokenUsage | null;
    resultSubtype: string | null;
};

/** Parse une ligne JSON stdout de Claude CLI et émet le résultat */
function parseClaudeJsonLine(rawLine: string, state: OneShotState, emit: EmitFn): void {
    if (!rawLine.trim()) return;
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
            state.resultSubtype = obj.subtype ?? null;
            const u = obj.usage;
            if (u && (u.input_tokens !== undefined || u.inputTokens !== undefined)) {
                state.capturedUsage = {
                    inputTokens: u.input_tokens ?? u.inputTokens ?? 0,
                    outputTokens: u.output_tokens ?? u.outputTokens ?? 0,
                };
                emit(JSON.stringify(state.capturedUsage), "usage");
            }
        }
    } catch {
        emit(rawLine, "agent");
    }
}

/** Mode orchestré : plusieurs étapes via orchestrate(), retourne directement une Response */
function runOrchestrated(
    taskId: string,
    task: NonNullable<ReturnType<typeof getTask>>,
    root: string,
    rawPrompt: string | undefined,
): Response {
    updateTask(taskId, { status: "planification", logs: [] });

    const encoder = new TextEncoder();
    const allLogs: string[] = [];
    const planLines: string[] = [];

    // Initialiser le fichier log
    const logFile = path.join(getTasksDir(), `${taskId}.log`);
    try { fs.writeFileSync(logFile, "", "utf-8"); } catch { /* silencieux */ }
    const bus = getLogBus(taskId);

    const stream = new ReadableStream({
        start(controller) {
            const emit = (line: string, type: "agent" | "system" | "segment" = "agent") => {
                try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line, type })}\n\n`)); } catch { /* fermé */ }
                allLogs.push(line);
                if (type === "agent" || type === "segment") planLines.push(line);
                try { fs.appendFileSync(logFile, JSON.stringify({ line, type }) + "\n", "utf-8"); } catch { /* silencieux */ }
                bus.emit("log", { line, type });
            };

            orchestrate(task, root, rawPrompt || undefined, (event) => {
                if (event.type === "text") {
                    emit(event.payload, event.segment === "merged" ? "agent" : "segment");
                } else if (event.type === "system") {
                    emit(event.payload, "system");
                } else if (event.type === "error") {
                    emit(`[erreur segment ${event.segment}: ${event.payload}]`, "system");
                }
            }).then(() => {
                savePlan(taskId, planLines);
                updateTask(taskId, { status: "implementation", logs: allLogs });
                emit("[✓ orchestration terminée]", "system");
                try { controller.close(); } catch { /* déjà fermé */ }
                setTimeout(() => clearLogBus(taskId), 5000);
            }).catch((err: Error) => {
                emit(`[erreur orchestration: ${err.message}]`, "system");
                updateTask(taskId, { status: "failed", logs: allLogs });
                try { controller.close(); } catch { /* déjà fermé */ }
                setTimeout(() => clearLogBus(taskId), 5000);
            });
        }
    });

    return new Response(stream, { headers: SSE_HEADERS });
}

/** Mode session long-lived : envoie un tour à une session Claude existante */
function runSession(
    taskId: string,
    prompt: string,
    contextStats: { methods: number; hasAtlas: boolean } | null,
    emit: EmitFn,
    allLogs: string[],
    controller: ReadableStreamDefaultController,
): void {
    if (contextStats) emit(JSON.stringify(contextStats), "context");
    emit("⚙ Envoi du message à la session…", "system");

    let capturedUsage: TokenUsage | null = null;

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
            const existing = getTask(taskId);
            if (existing) {
                const updates: Parameters<typeof updateTask>[1] = { logs: allLogs };
                if (capturedUsage) {
                    const prev = existing.totalUsage;
                    updates.usage = capturedUsage;
                    updates.totalUsage = {
                        inputTokens: (prev?.inputTokens ?? 0) + capturedUsage.inputTokens,
                        outputTokens: (prev?.outputTokens ?? 0) + capturedUsage.outputTokens,
                    };
                    addProjectUsage(capturedUsage.inputTokens, capturedUsage.outputTokens);
                }
                updateTask(taskId, updates);
            }
            destroySession(taskId);
            emit("false", "session_status");
            emit("[✓ tour terminé]", "system");
            try { controller.close(); } catch { /* déjà fermé */ }
        } else if (event.type === "error") {
            emit(`[erreur: ${event.payload}]`, "system");
            updateTask(taskId, { status: "failed", logs: allLogs });
            try { controller.close(); } catch { /* déjà fermé */ }
        }
    });
}

/** Mode one-shot : spawn claude -p, stream stdout/stderr */
function runOneShot(
    taskId: string | undefined,
    prompt: string,
    root: string,
    isImplementationPhase: boolean,
    contextStats: { methods: number; hasAtlas: boolean } | null,
    emit: EmitFn,
    allLogs: string[],
    planLines: string[],
    controller: ReadableStreamDefaultController,
): void {
    const spawnArgs = ["-p", "--verbose", "--dangerously-skip-permissions", "--output-format", "stream-json", "--add-dir", root];
    const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;
    const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";
    const proc = spawn(claudeCmd, spawnArgs, { shell: true, windowsHide: true, env: cleanEnv, cwd: root });

    if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }
    if (taskId) register(taskId, proc);
    if (proc.pid) emit(`[pid:${proc.pid}]`, "system");
    emit("⚙ Analyse du projet en cours…", "system");
    if (contextStats) emit(JSON.stringify(contextStats), "context");

    const state: OneShotState = { capturedUsage: null, resultSubtype: null };
    let stdoutBuf = "";
    let stderrBuf = "";

    proc.stdout.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop() ?? "";
        for (const rawLine of lines) parseClaudeJsonLine(rawLine, state, emit);
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
        if (stdoutBuf.trim()) parseClaudeJsonLine(stdoutBuf.trim(), state, emit);
        if (stderrBuf.trim()) emit(stderrBuf, "system");

        const success = code === 0 || state.resultSubtype === "success";
        const status = success ? "implementation" : "failed";

        if (taskId) {
            unregister(taskId);
            if (success && state.capturedUsage) {
                const existing = getTask(taskId);
                const prev = existing?.totalUsage;
                const totalUsage: TokenUsage = {
                    inputTokens: (prev?.inputTokens ?? 0) + state.capturedUsage.inputTokens,
                    outputTokens: (prev?.outputTokens ?? 0) + state.capturedUsage.outputTokens,
                };
                updateTask(taskId, { status, logs: allLogs, usage: state.capturedUsage, totalUsage, planUsage: state.capturedUsage });
                addProjectUsage(state.capturedUsage.inputTokens, state.capturedUsage.outputTokens);
            } else {
                updateTask(taskId, { status, logs: allLogs });
            }
            if (success) savePlan(taskId, planLines);
        }
        if (isImplementationPhase) emit("false", "session_status");
        emit(`[${success ? "✓ terminé" : `erreur (code ${code})`}]`, "system");
        try { controller.close(); } catch { /* déjà fermé */ }
    });
}

/** Reçoit une requête agent et détermine la phase d'exécution */
export async function POST({ request }) {
    const body = await request.json();
    const { prompt: rawPrompt, plan, taskId, projectRoot, isFollowUp, orchestrated, contextFollowUp } = body;
    const root = projectRoot?.trim() || getProjectRoot();

    const isImplementationPhase = !!(plan?.trim() && taskId);
    const isSessionPhase = !!(isFollowUp && taskId);

    // contextFollowUp : injecter les derniers logs dans le prompt
    let prompt: string = rawPrompt ?? "";
    if (contextFollowUp && taskId && rawPrompt?.trim()) {
        const prevTask = getTask(taskId);
        const prevLines = (prevTask?.logs ?? [])
            .filter(l => l.trim() && !l.startsWith('[') && !l.startsWith('⚙'))
            .slice(-20);
        if (prevLines.length > 0) {
            prompt = `${prevLines.join('\n')}\n\n---\n\n${rawPrompt.trim()}`;
        }
    }

    // Prompt enrichi côté serveur pour la phase d'implémentation
    let contextStats: { methods: number; hasAtlas: boolean } | null = null;
    if (isImplementationPhase && !isFollowUp) {
        const task = getTask(taskId);
        if (task) {
            const planHint = plan.replace(/\n+/g, " ").trim().slice(0, 250);
            const query    = `${task.title} ${planHint}`;
            const methods  = loadMethodSnippets(root, query);
            const docs     = loadProjectDocs(root);
            // Atlas : si toggle actif, lire ATLAS.md (le générer si absent)
            let atlas: string | undefined;
            if (task.atlasEnabled) {
                atlas = ensureAtlasMd(task);
            }
            contextStats   = { methods: methods?.length ?? 0, hasAtlas: !!(atlas?.trim()) };
            prompt = formatImplementationPrompt(task, plan, methods, docs, atlas, root);
            console.log(`\n${'─'.repeat(80)}\n[PROMPT][taskId=${taskId}]\n${'─'.repeat(80)}\n${prompt}\n${'─'.repeat(80)}\n`);
        } else {
            prompt = plan;
        }
    }

    // ── Mode orchestré ──
    if (orchestrated && taskId && !isFollowUp) {
        const task = getTask(taskId);
        if (!task) return new Response(JSON.stringify({ error: "Task introuvable" }), { status: 404, headers: { "Content-Type": "application/json" } });
        return runOrchestrated(taskId, task, root, rawPrompt);
    }

    if (!prompt?.trim()) {
        return new Response(JSON.stringify({ error: "Prompt manquant" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (isFollowUp && taskId && !isSessionAlive(taskId)) {
        return new Response(JSON.stringify({ error: "Pas de session active pour cette task" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (isSessionPhase && taskId && isSessionBusy(taskId)) {
        return new Response(JSON.stringify({ error: "Session occupée" }), { status: 409, headers: { "Content-Type": "application/json" } });
    }
    if (taskId) {
        const task = getTask(taskId);
        if (!task) return new Response(JSON.stringify({ error: "Task introuvable" }), { status: 404, headers: { "Content-Type": "application/json" } });
        updateTask(taskId, isSessionPhase ? { logs: [] } : { status: "planification", logs: [] });
    }
    if (taskId && !isFollowUp && isRunning(taskId)) killProcess(taskId);

    const encoder = new TextEncoder();
    const allLogs: string[] = [];
    const planLines: string[] = [];

    // Initialiser le fichier log pour ce run
    const runLogFile = taskId ? path.join(getTasksDir(), `${taskId}.log`) : null;
    if (runLogFile) {
        try { fs.writeFileSync(runLogFile, "", "utf-8"); } catch { /* silencieux */ }
    }
    const runBus = taskId ? getLogBus(taskId) : null;

    const stream = new ReadableStream({
        start(controller) {
            const emit = (line: string, type: "agent" | "system" | "usage" | "context" | "session_status" = "agent") => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line, type })}\n\n`));
                } catch { /* stream fermé */ }
                if (type !== "usage" && type !== "context" && type !== "session_status") allLogs.push(line);
                if (type === "agent") planLines.push(line);
                if (type !== "context" && type !== "session_status" && runLogFile) {
                    try { fs.appendFileSync(runLogFile, JSON.stringify({ line, type }) + "\n", "utf-8"); } catch { /* silencieux */ }
                }
                if (runBus && type !== "context" && type !== "session_status") runBus.emit("log", { line, type });
            };

            if (isSessionPhase && taskId) {
                runSession(taskId, prompt, contextStats, emit, allLogs, controller);
            } else {
                runOneShot(taskId, prompt, root, isImplementationPhase, contextStats, emit, allLogs, planLines, controller);
                // Nettoyer le bus après la fin du one-shot (délai pour permettre les reconnexions tardives)
                if (taskId) {
                    const _taskId = taskId;
                    // Le nettoyage est déclenché depuis onClose dans runOneShot via emit("[✓ terminé]")
                    // On schedule ici un nettoyage de sécurité après 30s
                    setTimeout(() => clearLogBus(_taskId), 30_000);
                }
            }
        }
    });

    return new Response(stream, { headers: SSE_HEADERS });
}
