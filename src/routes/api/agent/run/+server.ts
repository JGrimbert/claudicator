import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { getTask, updateTask, getTasksDir } from "$lib/server/services/tasks";
import { register, unregister, killProcess } from "$lib/server/services/processes";
import { getProjectRoot } from "$lib/server/services/projects";

/** Sauvegarde la sortie de l'agent dans <taskId>.plan.md à côté du JSON de la task. */
function savePlan(taskId: string, lines: string[]) {
    const agentLines = lines.filter(l => !l.startsWith("[") || !l.endsWith("]"));
    if (agentLines.length === 0) return;
    try {
        const dir = getTasksDir();
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${taskId}.plan.md`), agentLines.join("\n"), "utf-8");
    } catch { /* silencieux */ }
}

export async function POST({ request }) {
    const body = await request.json();
    const { prompt, taskId, projectRoot } = body;
    const root = projectRoot?.trim() || getProjectRoot();

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

            // -p : mode non-interactif (print).
            // Le prompt est passé via stdin pour éviter les problèmes d'échappement
            // shell avec les prompts longs / multi-lignes.
            // Retirer les variables qui bloquent l'exécution :
            //   ANTHROPIC_API_KEY : si invalide, claude refuse de démarrer
            //   CLAUDECODE        : empêche les sessions imbriquées (Claude Code)
            const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;

            const proc = spawn(
                "claude",
                ["-p", "--dangerously-skip-permissions", "--add-dir", root],
                { shell: true, windowsHide: true, env: cleanEnv, cwd: root }
            );
            if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }
            if (taskId) register(taskId, proc);
            if (proc.pid) emit(`[pid:${proc.pid}]`, "system");

            // Buffer ligne par ligne pour ne pas couper les lignes en milieu de chunk.
            let stdoutBuf = "";
            let stderrBuf = "";

            proc.stdout.on("data", (chunk: Buffer) => {
                stdoutBuf += chunk.toString();
                const lines = stdoutBuf.split("\n");
                stdoutBuf = lines.pop() ?? "";
                lines.filter(Boolean).forEach(l => emit(l, "agent"));
            });
            proc.stderr.on("data", (chunk: Buffer) => {
                stderrBuf += chunk.toString();
                const lines = stderrBuf.split("\n");
                stderrBuf = lines.pop() ?? "";
                lines.filter(Boolean).forEach(l => emit(l, "system"));
            });
            proc.on("error", (err: Error) => {
                emit(`[erreur: ${err.message}]`, "system");
                if (taskId) { unregister(taskId); updateTask(taskId, { status: "failed", logs: allLogs }); }
                try { controller.close(); } catch { /* déjà fermé */ }
            });
            proc.on("close", (code: number | null) => {
                if (stdoutBuf.trim()) emit(stdoutBuf, "agent");
                if (stderrBuf.trim()) emit(stderrBuf, "system");
                const status = code === 0 ? "done" : "failed";
                if (taskId) {
                    unregister(taskId);
                    updateTask(taskId, { status, logs: allLogs });
                    if (code === 0) savePlan(taskId, allLogs);
                }
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
