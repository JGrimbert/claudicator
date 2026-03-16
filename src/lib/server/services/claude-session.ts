import { spawn } from "child_process";
import type { ChildProcess } from "child_process";

export type TurnEventType = "agent_text" | "tool_use" | "usage" | "turn_end" | "stderr" | "error";

export interface TurnEvent {
    type: TurnEventType;
    payload: unknown;
}

type SessionStatus = "idle" | "busy" | "destroyed";

interface Session {
    proc: ChildProcess;
    status: SessionStatus;
    turnCallback: ((e: TurnEvent) => void) | null;   // callback du tour en cours (sendTurn)
    streamClients: Set<(e: TurnEvent) => void>;       // clients reconnectés (fan-out)
    replayLog: TurnEvent[];                            // max 200 événements récents
    stdoutBuf: string;
    stderrBuf: string;
}

const sessions = new Map<string, Session>();

/** Supprime les séquences ANSI d'une chaîne. */
function stripAnsi(str: string): string {
    return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, "").replace(/\x1B\][^\x07]*\x07/g, "").trim();
}

/** Dispatche un événement à tous les listeners et l'ajoute au replayLog. */
function broadcast(session: Session, event: TurnEvent): void {
    session.replayLog.push(event);
    if (session.replayLog.length > 200) session.replayLog.shift();
    session.turnCallback?.(event);
    for (const cb of session.streamClients) cb(event);
}

/** Parse une ligne JSON stdout et émet les événements. */
function processStdoutLine(rawLine: string, session: Session): void {
    if (!session.turnCallback && session.streamClients.size === 0) return;
    if (!rawLine.trim()) return;
    try {
        const obj = JSON.parse(rawLine);
        if (obj.type === "assistant") {
            const content = obj.message?.content ?? [];
            for (const block of content) {
                if (block.type === "text" && block.text) {
                    broadcast(session, { type: "agent_text", payload: block.text });
                } else if (block.type === "tool_use" && block.name) {
                    const inp = block.input as Record<string, unknown> | undefined;
                    const hint = inp
                        ? (Object.values(inp).find(v => typeof v === "string") as string | undefined)
                        : undefined;
                    broadcast(session, { type: "tool_use", payload: `⚙ ${block.name}${hint ? ` ${hint.slice(0, 80)}` : ""}` });
                }
            }
        } else if (obj.type === "result") {
            const u = obj.usage;
            if (u && (u.input_tokens !== undefined || u.inputTokens !== undefined)) {
                broadcast(session, {
                    type: "usage",
                    payload: {
                        inputTokens: u.input_tokens ?? u.inputTokens ?? 0,
                        outputTokens: u.output_tokens ?? u.outputTokens ?? 0,
                    },
                });
            }
            // Sauvegarder le turnCallback et le vider AVANT turn_end
            const tc = session.turnCallback;
            session.turnCallback = null;
            session.status = "idle";
            const endEvent: TurnEvent = { type: "turn_end", payload: obj.subtype ?? null };
            session.replayLog.push(endEvent);
            if (session.replayLog.length > 200) session.replayLog.shift();
            tc?.(endEvent);
            for (const cb of session.streamClients) cb(endEvent);
        }
        // Autres types (system, user/tool_result…) → ignorés
    } catch {
        // Ligne non-JSON → émettre telle quelle
        broadcast(session, { type: "agent_text", payload: rawLine });
    }
}

/** Crée et enregistre une session Claude persistante avec stdin/stdout. */
export function createSession(sessionId: string, cwd: string, addDir: string): void {
    if (sessions.has(sessionId)) return;

    const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;
    const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";

    const proc = spawn(
        claudeCmd,
        ["--dangerously-skip-permissions", "--output-format", "stream-json", "--add-dir", addDir],
        { shell: true, windowsHide: true, env: cleanEnv, cwd }
    );

    const session: Session = {
        proc,
        status: "idle",
        turnCallback: null,
        streamClients: new Set(),
        replayLog: [],
        stdoutBuf: "",
        stderrBuf: "",
    };
    sessions.set(sessionId, session);

    proc.stdout?.on("data", (chunk: Buffer) => {
        session.stdoutBuf += chunk.toString();
        const lines = session.stdoutBuf.split("\n");
        session.stdoutBuf = lines.pop() ?? "";
        for (const line of lines) processStdoutLine(line, session);
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
        session.stderrBuf += chunk.toString();
        const lines = session.stderrBuf.split("\n");
        session.stderrBuf = lines.pop() ?? "";
        for (const l of lines) {
            const line = stripAnsi(l);
            // Filtrer les prompts interactifs courts (">", "?", etc.)
            if (!line || line.length < 2) continue;
            broadcast(session, { type: "stderr", payload: line });
        }
    });

    proc.on("error", (err: Error) => {
        const tc = session.turnCallback;
        session.turnCallback = null;
        session.status = "destroyed";
        sessions.delete(sessionId);
        const event: TurnEvent = { type: "error", payload: err.message };
        tc?.(event);
        for (const cb of session.streamClients) cb(event);
        session.streamClients.clear();
    });

    proc.on("close", () => {
        const tc = session.turnCallback;
        session.turnCallback = null;
        session.status = "destroyed";
        sessions.delete(sessionId);
        // Signaler l'erreur seulement si un tour était en cours ou des clients connectés
        if (tc || session.streamClients.size > 0) {
            const event: TurnEvent = { type: "error", payload: "Session fermée de manière inattendue" };
            tc?.(event);
            for (const cb of session.streamClients) cb(event);
        }
        session.streamClients.clear();
    });
}

/** Envoie un message à la session existante et streame les événements jusqu'à turn_end. */
export function sendTurn(
    sessionId: string,
    message: string,
    onEvent: (e: TurnEvent) => void
): void {
    const session = sessions.get(sessionId);
    if (!session || session.status === "destroyed") {
        onEvent({ type: "error", payload: "Session introuvable ou détruite" });
        return;
    }
    if (session.status === "busy") {
        onEvent({ type: "error", payload: "Session occupée" });
        return;
    }
    session.status = "busy";
    session.turnCallback = onEvent;
    session.proc.stdin!.write(message + "\n");
}

/** Tue le process et supprime la session. */
export function destroySession(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.status = "destroyed";
    sessions.delete(sessionId);
    session.streamClients.clear();
    if (process.platform === "win32" && session.proc.pid) {
        spawn("taskkill", ["/F", "/T", "/PID", String(session.proc.pid)], { shell: false });
    } else {
        session.proc.kill("SIGTERM");
    }
}

/** Détruit toutes les sessions actives (nettoyage au redémarrage). */
export function destroyAllSessions(): void {
    for (const id of [...sessions.keys()]) destroySession(id);
}

/** Vrai si la session existe et n'est pas détruite. */
export function isSessionAlive(sessionId: string): boolean {
    const s = sessions.get(sessionId);
    return !!s && s.status !== "destroyed";
}

/** Vrai si la session est en train de traiter un tour. */
export function isSessionBusy(sessionId: string): boolean {
    const s = sessions.get(sessionId);
    return !!s && s.status === "busy";
}

/** Enregistre un client SSE persistant sur la session (fan-out). */
export function registerStreamClient(sessionId: string, cb: (e: TurnEvent) => void): void {
    const s = sessions.get(sessionId);
    if (s) s.streamClients.add(cb);
}

/** Supprime un client SSE de la session. */
export function unregisterStreamClient(sessionId: string, cb: (e: TurnEvent) => void): void {
    const s = sessions.get(sessionId);
    if (s) s.streamClients.delete(cb);
}

/** Retourne une copie du replayLog de la session (événements depuis le dernier démarrage). */
export function getReplayLog(sessionId: string): TurnEvent[] {
    const s = sessions.get(sessionId);
    return s ? [...s.replayLog] : [];
}
