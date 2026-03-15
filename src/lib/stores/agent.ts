import { writable, derived } from "svelte/store";

// Référence module-level à la connexion SSE active (survit aux changements de composants)
let _streamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

export type ContextItem =
    | { kind: "method"; key: string; file: string; startLine: number | null; summary: string; snippet: string | null }
    | { kind: "grep";   file: string; line: number; content: string }

export type Context = {
    source: { kind: "task" | "issue" | "todo"; label: string };
    items: ContextItem[];
    loading: boolean;
    error: string;
}

export const contextState = writable<Context>({
    source: { kind: "task", label: "" },
    items: [],
    loading: false,
    error: "",
});

export type RunLog = { line: string; type: "agent" | "system" | "usage" | "context" | "session_status" };

export const agentRunState = writable<{
    taskId: string | null;
    taskTitle: string;
    logs: RunLog[];
    running: boolean;
    sessionAlive: boolean;
    consoleMinimized: boolean;
}>({
    taskId: null,
    taskTitle: "",
    logs: [],
    running: false,
    sessionAlive: false,
    consoleMinimized: false,
});

/**
 * Consomme un stream SSE (fetch Response) et pousse les événements dans agentRunState.
 * La référence au reader est stockée au niveau module pour survivre aux changements de composants.
 * Appelle opts.onDone() à la fin (succès ou erreur).
 */
export async function startConsoleStream(
    res: Response,
    opts?: { onDone?: () => void }
): Promise<void> {
    if (!res.ok || !res.body) {
        agentRunState.update(s => ({
            ...s,
            running: false,
            logs: [...s.logs, { line: `[erreur HTTP ${res.status}]`, type: "system" as RunLog["type"] }],
        }));
        opts?.onDone?.();
        return;
    }
    const reader = res.body.getReader();
    _streamReader = reader;
    const dec = new TextDecoder();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const raw of dec.decode(value).split("\n")) {
                if (!raw.startsWith("data: ")) continue;
                try {
                    const event = JSON.parse(raw.slice(6)) as { line: string; type: RunLog["type"] };
                    if (event.type === "session_status") {
                        agentRunState.update(s => ({ ...s, sessionAlive: event.line === "true" }));
                    } else {
                        agentRunState.update(s => ({ ...s, logs: [...s.logs, event as RunLog] }));
                    }
                } catch { /* ligne malformée */ }
            }
        }
    } catch { /* stream annulé ou erreur réseau */ }
    finally {
        _streamReader = null;
        agentRunState.update(s => ({ ...s, running: false }));
        opts?.onDone?.();
    }
}

/** Annule le stream SSE actif et passe running à false. */
export function stopConsoleStream(): void {
    if (_streamReader) {
        _streamReader.cancel().catch(() => {});
        _streamReader = null;
    }
    agentRunState.update(s => ({ ...s, running: false }));
}

/** Bascule l'état minimisé/développé du ConsoleDrawer. */
export function toggleConsoleMinimized(): void {
    agentRunState.update(s => ({ ...s, consoleMinimized: !s.consoleMinimized }));
}

export const taskRefreshTick = writable(0);
export const pendingSelectTaskId = writable<string | null>(null);
/** Notifie la création d'une tâche et rafraîchit */
export function notifyTaskCreated(taskId?: string) {
    if (taskId) pendingSelectTaskId.set(taskId);
    taskRefreshTick.update(n => n + 1);
}

export const hoveredIssueNumber = writable<number | null>(null);
export const taskIssueNumbers  = writable<Set<number>>(new Set());

export const issueAnalysis = writable<{
    running: boolean;
    updating: boolean;
    chatRunning: boolean;
    result: string | null;
    dismissed: boolean;
    logs: RunLog[];
    snapshotDiff: {
        added: number[];
        removed: number[];
        modified: number[];
    } | null;
    roadmapId: string | null;
}>({ running: false, updating: false, chatRunning: false, result: null, dismissed: false, logs: [], snapshotDiff: null, roadmapId: null });

export const projectUsage = writable<{ totalInputTokens: number; totalOutputTokens: number } | null>(null);

export const planModeTask = writable<{ id: string; title: string; issueNumber?: number } | null>(null);
export const consoleTab = writable<string>("codebase");

/** Passe à true une fois que TaskList a chargé les tasks et sélectionné l'éventuelle task en cours */
export const tasksReady = writable(false);

export const planAllState = writable<{
    running: boolean;
    currentTaskId: string | null;
}>({ running: false, currentTaskId: null });

export const activePlanGroupIndex = writable<number>(0);
export const globalPlanPrompt = writable<string | null>(null);

export type PlanGroup = { index: number; name: string; issues: number[] };

/** Parse le texte en groupes de plan structurés */
function parseGroups(text: string): PlanGroup[] {
    const groups: PlanGroup[] = [];
    const blocks = text.split(/(?=### Groupe \d)/);
    for (const block of blocks) {
        const nameMatch = block.match(/### Groupe \d+ — (.+)/);
        if (!nameMatch) continue;
        const issueMatch = block.match(/Issues\s*:\s*((?:#\d+(?:,\s*)?)+)/);
        const issues = issueMatch
            ? [...issueMatch[1].matchAll(/#(\d+)/g)].map(m => parseInt(m[1]))
            : [];
        if (issues.length > 0)
            groups.push({ index: groups.length + 1, name: nameMatch[1].trim(), issues });
    }
    return groups;
}

export const planGroups = derived(issueAnalysis, $a => $a.result ? parseGroups($a.result) : []);

export const clusterFocusedSymbol = writable<{ name: string; dir: string } | null>(null);

export type Log = {
    ts: string;
    level: "INFO" | "SUCCESS" | "ERROR";
    message: string;
};

export type SubIssue = {
    number: number;
    title: string;
    body?: string;
    state: string;
};

export type Label = {
    name: string;
    color: string;
};

export type Issue = {
    number: number;
    title: string;
    body: string;
    state: string;
    created: string;
    labels: Label[];
    subIssues: SubIssue[];
};

export type AgentStatus = "idle" | "loading" | "planning" | "done" | "error";

export const agentState = writable<{
    issue: Issue | null;
    plan: string | null;
    logs: Log[];
    status: AgentStatus;
    navigationStack: Issue[];
    knownSubIssueNumbers: number[];
}>({
    issue: null,
    plan: null,
    logs: [],
    status: "idle",
    navigationStack: [],
    knownSubIssueNumbers: []
});
