/**
 * /api/roadmap-watch
 *
 * GET → SSE stream : envoie "changed" quand ai/roadmap.json est modifié
 */
import fs from "fs";
import path from "path";
import { getProjectRoot } from "$lib/server/services/projects";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => {
    const projectRoot = getProjectRoot();
    const aiDir = path.join(projectRoot, "ai");

    let watcher: fs.FSWatcher | null = null;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            const send = (data: string) => {
                try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)); } catch { /* client déconnecté */ }
            };

            send("connected");

            try {
                if (fs.existsSync(aiDir)) {
                    watcher = fs.watch(aiDir, (_event, filename) => {
                        if (filename === "roadmap.json") send("changed");
                    });
                }
            } catch { /* répertoire inaccessible */ }
        },
        cancel() {
            watcher?.close();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store",
            "Connection": "keep-alive",
        },
    });
};
