/** Agent — reconnexion SSE à une session Claude existante */
import {
    isSessionAlive,
    isSessionBusy,
    getReplayLog,
    registerStreamClient,
    unregisterStreamClient,
} from "$lib/server/services/claude-session";
import type { TurnEvent } from "$lib/server/services/claude-session";
import { getTask } from "$lib/server/services/tasks";

/**
 * Se rebranche sur une session en cours sans la relancer.
 * - Rejoue les logs persistés sur disque (type "replay")
 * - Rejoue les événements en mémoire depuis le dernier tour (type "replay")
 * - S'abonne aux nouveaux événements si le tour est encore en cours
 */
export async function POST({ request }) {
    const { taskId } = await request.json();

    if (!taskId) {
        return new Response(JSON.stringify({ error: "taskId manquant" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    if (!isSessionAlive(taskId)) {
        return new Response(JSON.stringify({ error: "Session non active" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    const task = getTask(taskId);
    const persistedLogs: string[] = task?.logs ?? [];
    const replayLog = getReplayLog(taskId);
    const isBusy = isSessionBusy(taskId);

    const encoder = new TextEncoder();
    // onEvent est défini dans start() — référencé dans cancel() via closure
    let onEvent: ((e: TurnEvent) => void) | null = null;

    const stream = new ReadableStream({
        start(controller) {
            const emit = (line: string, type: string) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line, type })}\n\n`));
                } catch { /* stream fermé */ }
            };

            // Rejouer les logs persistés sur disque
            for (const log of persistedLogs) {
                emit(log, "replay");
            }

            // Rejouer les événements en mémoire (depuis dernier démarrage de turn)
            for (const event of replayLog) {
                if (event.type === "agent_text") emit(event.payload as string, "replay");
                else if (event.type === "tool_use") emit(event.payload as string, "replay");
                else if (event.type === "stderr") emit(event.payload as string, "replay");
                // usage et turn_end ne sont pas rejoués
            }

            if (!isBusy) {
                // Session idle — signaler qu'elle est vivante puis fermer
                emit("true", "session_status");
                try { controller.close(); } catch { /* déjà fermé */ }
                return;
            }

            // S'abonner aux nouveaux événements du tour en cours
            onEvent = (event: TurnEvent) => {
                if (event.type === "agent_text") emit(event.payload as string, "agent");
                else if (event.type === "tool_use") emit(event.payload as string, "system");
                else if (event.type === "stderr") emit(event.payload as string, "system");
                else if (event.type === "usage") emit(JSON.stringify(event.payload), "usage");
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

    return new Response(stream, {
        headers: {
            "Content-Type":  "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive"
        }
    });
}
