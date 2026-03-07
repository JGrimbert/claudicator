import { spawn } from "child_process";
import { getTask, updateTask } from "$lib/server/services/tasks";

export async function POST({ request }) {
    const body = await request.json();
    const { prompt, taskId } = body;

    if (!prompt?.trim()) {
        return new Response(JSON.stringify({ error: "Prompt manquant" }), {
            status: 400,
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
        updateTask(taskId, { status: "running", logs: [] });
    }

    const encoder = new TextEncoder();
    const allLogs: string[] = [];

    const stream = new ReadableStream({
        start(controller) {
            const emit = (line: string, type: "agent" | "system" = "agent") => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line, type })}\n\n`));
                } catch { /* stream fermé */ }
                allLogs.push(line);
            };

            // Correspond au pattern existant dans claude.ts
            const proc = spawn("claude", [prompt], {
                shell: true,
                windowsHide: true,
                env: process.env as NodeJS.ProcessEnv
            });

            proc.stdout.on("data", (chunk: Buffer) =>
                chunk.toString().split("\n").filter(Boolean).forEach((l) => emit(l, "agent"))
            );
            proc.stderr.on("data", (chunk: Buffer) =>
                chunk.toString().split("\n").filter(Boolean).forEach((l) => emit(l, "system"))
            );
            proc.on("error", (err: Error) => {
                emit(`[erreur: ${err.message}]`, "system");
                if (taskId) updateTask(taskId, { status: "failed", logs: allLogs });
                try { controller.close(); } catch { /* déjà fermé */ }
            });
            proc.on("close", (code: number | null) => {
                const status = code === 0 ? "done" : "failed";
                if (taskId) updateTask(taskId, { status, logs: allLogs });
                const msg = code === 0 ? "✓ terminé" : `erreur (code ${code})`;
                emit(`[${msg}]`, "system");
                try { controller.close(); } catch { /* déjà fermé */ }
            });
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
