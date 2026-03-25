/** Agent — reconnexion SSE à une session Claude ou un processus one-shot */
import fs from "fs";
import path from "path";
import {
    isSessionAlive,
    isSessionBusy,
    getReplayLog,
    registerStreamClient,
    unregisterStreamClient,
} from "$lib/server/services/claude-session";
import type { TurnEvent } from "$lib/server/services/claude-session";
import { getTask, getTasksDir } from "$lib/server/services/tasks";
import { isRunning, getLogBus } from "$lib/server/services/processes";

const SSE_HEADERS = {
    "Content-Type":  "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection":    "keep-alive",
} as const;

/**
 * Se rebranche sur une session ou un processus one-shot en cours.
 *
 * Mode session :
 *   - Rejoue les logs persistés sur disque (type "replay")
 *   - Rejoue les événements en mémoire depuis le dernier tour (type "replay")
 *   - S'abonne aux nouveaux événements si le tour est encore en cours
 *
 * Mode one-shot :
 *   - Rejoue les logs depuis .agent/tasks/<id>.log (type "replay")
 *   - S'abonne au logBus si le processus tourne encore
 *
 * Si aucun process/session actif : rejoue les logs du fichier et ferme.
 */
export async function POST({ request }) {
    const { taskId } = await request.json();

    if (!taskId) {
        return new Response(JSON.stringify({ error: "taskId manquant" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    const encoder = new TextEncoder();

    // ── Mode session long-lived ────────────────────────────────────────────────
    if (isSessionAlive(taskId)) {
        const task = getTask(taskId);
        const persistedLogs: string[] = task?.logs ?? [];
        const replayLog = getReplayLog(taskId);
        const isBusy = isSessionBusy(taskId);

        let onEvent: ((e: TurnEvent) => void) | null = null;

        const stream = new ReadableStream({
            start(controller) {
                const emit = (line: string, type: string) => {
                    try {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line, type })}\n\n`));
                    } catch { /* stream fermé */ }
                };

                // Rejouer les logs persistés sur disque
                for (const log of persistedLogs) emit(log, "replay");

                // Rejouer les événements en mémoire
                for (const event of replayLog) {
                    if (event.type === "agent_text") emit(event.payload as string, "replay");
                    else if (event.type === "tool_use") emit(event.payload as string, "replay");
                    else if (event.type === "stderr")   emit(event.payload as string, "replay");
                }

                if (!isBusy) {
                    emit("true", "session_status");
                    try { controller.close(); } catch { /* déjà fermé */ }
                    return;
                }

                onEvent = (event: TurnEvent) => {
                    if (event.type === "agent_text") emit(event.payload as string, "agent");
                    else if (event.type === "tool_use") emit(event.payload as string, "system");
                    else if (event.type === "stderr")   emit(event.payload as string, "system");
                    else if (event.type === "usage")    emit(JSON.stringify(event.payload), "usage");
                    else if (event.type === "turn_end") {
                        emit("true", "session_status");
                        emit("[✓ tour terminé — session active]", "system");
                        try { controller.close(); } catch { /* déjà fermé */ }
                    } else if (event.type === "error") {
                        emit(`[erreur: ${event.payload}]`, "system");
                        try { controller.close(); } catch { /* déjà fermé */ }
                    }
                };
                registerStreamClient(taskId, onEvent);
            },
            cancel() {
                if (onEvent) {
                    unregisterStreamClient(taskId, onEvent);
                    onEvent = null;
                }
            }
        });

        return new Response(stream, { headers: SSE_HEADERS });
    }

    // ── Mode one-shot (plan/orchestration) ───────────────────────────────────
    const logFile = path.join(getTasksDir(), `${taskId}.log`);
    let replayLogs: Array<{ line: string; type: string }> = [];
    try {
        const content = fs.readFileSync(logFile, "utf-8");
        replayLogs = content
            .split("\n")
            .filter(Boolean)
            .map(l => { try { return JSON.parse(l) as { line: string; type: string }; } catch { return null; } })
            .filter((x): x is { line: string; type: string } => x !== null);
    } catch { /* fichier absent ou illisible */ }

    const oneShotRunning = isRunning(taskId);

    let onLog: ((e: { line: string; type: string }) => void) | null = null;

    const stream = new ReadableStream({
        start(controller) {
            const emit = (line: string, type: string) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line, type })}\n\n`));
                } catch { /* stream fermé */ }
            };

            // Replay des logs déjà écrits
            for (const log of replayLogs) emit(log.line, "replay");

            if (!oneShotRunning) {
                // Processus terminé — signaler et fermer
                emit("[reconnecté — processus terminé]", "system");
                try { controller.close(); } catch { /* déjà fermé */ }
                return;
            }

            // S'abonner aux nouveaux logs via le bus
            const bus = getLogBus(taskId);
            onLog = ({ line, type }: { line: string; type: string }) => {
                emit(line, type);
                if (line.startsWith("[✓") || line.startsWith("[erreur")) {
                    if (onLog) { bus.off("log", onLog); onLog = null; }
                    try { controller.close(); } catch { /* déjà fermé */ }
                }
            };
            bus.on("log", onLog);
        },
        cancel() {
            if (onLog) {
                const bus = getLogBus(taskId);
                bus.off("log", onLog);
                onLog = null;
            }
        }
    });

    return new Response(stream, { headers: SSE_HEADERS });
}
