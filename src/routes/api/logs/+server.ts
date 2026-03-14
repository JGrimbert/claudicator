import { logEmitter } from "$lib/server/logs";
import type { Log } from "$lib/server/logs";

/** Stream les logs en temps réel via SSE */
export async function GET() {
    let listener: ((log: Log) => void) | null = null;

    const stream = new ReadableStream({
        start(controller) {
            listener = (log: Log) => {
                try {
                    const data = `data: ${JSON.stringify(log)}\n\n`;
                    controller.enqueue(new TextEncoder().encode(data));
                } catch {
                    // stream fermé
                }
            };
            logEmitter.on("log", listener);
        },
        cancel() {
            if (listener) {
                logEmitter.off("log", listener);
            }
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    });
}
