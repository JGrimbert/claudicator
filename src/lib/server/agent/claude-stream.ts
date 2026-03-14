import { spawn } from "child_process";

function stripAnsi(str: string): string {
    return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').replace(/\x1B\][^\x07]*\x07/g, '').trim();
}

/**
 * Spawne claude en mode stream-json et retourne un ReadableStream SSE.
 * Appelle onSuccess(allAgentLines) si code === 0 ou resultSubtype === "success".
 */
export function spawnClaudeStream(
    prompt: string,
    project: { path?: string },
    onSuccess: (lines: string[]) => void,
    options?: { addDir?: string }
): ReadableStream {
    const encoder = new TextEncoder();
    const allAgentLines: string[] = [];
    let resultSubtype: string | null = null;

    return new ReadableStream({
        start(controller) {
            const emit = (line: string, type: "agent" | "system" | "usage" = "agent") => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line, type })}\n\n`));
                } catch { /* stream fermé */ }
                if (type === "agent") allAgentLines.push(line);
            };

            const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;
            const root = project.path ?? process.cwd();

            const args = ["-p", "--verbose", "--dangerously-skip-permissions", "--output-format", "stream-json"];
            if (options?.addDir) args.push("--add-dir", options.addDir);

            const proc = spawn(
                "claude",
                args,
                { shell: true, windowsHide: true, env: cleanEnv, cwd: root }
            );
            if (proc.stdin) { proc.stdin.write(prompt); proc.stdin.end(); }
            if (proc.pid) emit(`[pid:${proc.pid}]`, "system");

            let stdoutBuf = "";
            let stderrBuf = "";

            proc.stdout.on("data", (chunk: Buffer) => {
                stdoutBuf += chunk.toString();
                const lines = stdoutBuf.split("\n");
                stdoutBuf = lines.pop() ?? "";
                for (const rawLine of lines) {
                    if (!rawLine.trim()) continue;
                    try {
                        const obj = JSON.parse(rawLine);
                        if (obj.type === "assistant") {
                            for (const block of (obj.message?.content ?? [])) {
                                if (block.type === "text" && block.text) emit(block.text, "agent");
                                else if (block.type === "tool_use" && block.name) {
                                    const inp = block.input as Record<string, unknown> | undefined;
                                    const hint = inp ? Object.values(inp).find(v => typeof v === "string") as string | undefined : undefined;
                                    emit(`⚙ ${block.name}${hint ? ` ${hint.slice(0, 80)}` : ""}`, "system");
                                }
                            }
                        } else if (obj.type === "result") {
                            resultSubtype = obj.subtype ?? null;
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
                try { controller.close(); } catch { /* déjà fermé */ }
            });

            proc.on("close", (code: number | null) => {
                if (stdoutBuf.trim()) {
                    try {
                        const obj = JSON.parse(stdoutBuf.trim());
                        if (obj.type === "assistant") {
                            for (const block of (obj.message?.content ?? [])) {
                                if (block.type === "text" && block.text) emit(block.text, "agent");
                            }
                        } else if (obj.type === "result") {
                            resultSubtype = obj.subtype ?? null;
                        }
                    } catch { emit(stdoutBuf, "agent"); }
                }
                if (stderrBuf.trim()) emit(stderrBuf, "system");

                const success = code === 0 || resultSubtype === "success";
                if (success) onSuccess(allAgentLines);

                emit(`[${success ? "✓ terminé" : `erreur (code ${code})`}]`, "system");
                try { controller.close(); } catch { /* déjà fermé */ }
            });
        }
    });
}
