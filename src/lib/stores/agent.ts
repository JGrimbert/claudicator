import { writable, derived, get } from "svelte/store";

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

export type RunLog = { line: string; type: "agent" | "system" | "usage" | "context" | "session_status" | "replay" };

export const agentRunState = writable<{
    taskId: string | null;
    taskTitle: string;
    logs: RunLog[];
    running: boolean;
    sessionAlive: boolean;
    consoleMinimized: boolean;
    completionLabel: string | null;
}>({
    taskId: null,
    taskTitle: "",
    logs: [],
    running: false,
    sessionAlive: false,
    consoleMinimized: false,
    completionLabel: null,
});

/**
 * Consomme un stream SSE (fetch Response) et pousse les événements dans agentRunState.
 * La référence au reader est stockée au niveau module pour survivre aux changements de composants.
 * Appelle opts.onDone() à la fin (succès ou erreur).
 */
export async function startConsoleStream(
    res: Response,
    opts?: { onDone?: () => void; onEvent?: (event: RunLog & Record<string, any>) => void }
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
    consoleTab.set("console");
    // Persister taskId + title pour reconnexion après refresh
    const state = get(agentRunState);
    if (state.taskId) {
        try {
            sessionStorage.setItem("activeTaskId", state.taskId);
            sessionStorage.setItem("activeTaskTitle", state.taskTitle);
        } catch { /* SSR ou mode privé */ }
    }
    // Annuler l'éventuel stream précédent avant d'en démarrer un nouveau
    if (_streamReader) {
        _streamReader.cancel().catch(() => {});
        _streamReader = null;
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
                    const event = JSON.parse(raw.slice(6)) as RunLog & Record<string, any>;
                    if (event.type === "session_status") {
                        agentRunState.update(s => ({ ...s, sessionAlive: event.line === "true" }));
                    } else {
                        agentRunState.update(s => ({ ...s, logs: [...s.logs, event as RunLog] }));
                    }
                    opts?.onEvent?.(event);
                } catch { /* ligne malformée */ }
            }
        }
    } catch { /* stream annulé ou erreur réseau */ }
    finally {
        // Guard : n'écraser running que si c'est bien notre reader qui est encore actif.
        // Si stopConsoleStream() a été appelé (ou un autre stream a démarré), on laisse
        // l'état courant intact pour ne pas interrompre le run suivant.
        const wasUs = _streamReader === reader;
        _streamReader = null;
        if (wasUs) {
            agentRunState.update(s => ({ ...s, running: false }));
            // Ne pas supprimer activeTaskId — la session reste vivante après turn_end
            opts?.onDone?.();
        }
    }
}

/** Annule le stream SSE actif et passe running à false. Efface la persistance de session. */
export function stopConsoleStream(): void {
    if (_streamReader) {
        _streamReader.cancel().catch(() => {});
        _streamReader = null;
    }
    agentRunState.update(s => ({ ...s, running: false }));
    try {
        sessionStorage.removeItem("activeTaskId");
        sessionStorage.removeItem("activeTaskTitle");
    } catch { /* SSR ou mode privé */ }
}

/** Bascule l'état minimisé/développé du ConsoleDrawer. */
export function toggleConsoleMinimized(): void {
    agentRunState.update(s => ({ ...s, consoleMinimized: !s.consoleMinimized }));
}

export const taskRefreshTick = writable(0);
export const issueListRefreshTick = writable(0);
export const issueListPendingNumber = writable<number | null>(null);
export const pendingSelectTaskId = writable<string | null>(null);
export const projetPanelTab = writable<"todos" | "issues" | "tasks">("issues");
/** Notifie la création d'une tâche et rafraîchit */
export function notifyTaskCreated(taskId?: string) {
    if (taskId) {
        pendingSelectTaskId.set(taskId);
        projetPanelTab.set("tasks");
    }
    taskRefreshTick.update(n => n + 1);
}

export const hoveredIssueNumber = writable<number | null>(null);
export const taskIssueNumbers  = writable<Set<number>>(new Set());
export const todoIssueNumbers  = writable<Set<number>>(new Set());
export const issueListNumbers  = writable<Set<number>>(new Set());

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
export const consoleTab = writable<string>("atlas");

/** Passe à true une fois que TaskList a chargé les tasks et sélectionné l'éventuelle task en cours */
export const tasksReady = writable(false);

export const planAllState = writable<{
    running: boolean;
    currentTaskId: string | null;
}>({ running: false, currentTaskId: null });

export const activePlanGroupIndex = writable<number>(0);
export const globalPlanPrompt = writable<string | null>(null);

export type PlanGroup = { index: number; name: string; issues: number[]; summary: string; dependsOn: string[] };

/** Parse le texte en groupes de plan structurés */
function parseGroups(text: string): PlanGroup[] {
    const groups: PlanGroup[] = [];
    const blocks = text.split(/(?=### Groupe \d)/);
    for (const block of blocks) {
        const nameMatch = block.match(/### Groupe \d+ — (.+)/);
        if (!nameMatch) continue;
        const issueMatch = block.match(/Issues\s*:\s*((?:#\d+(?:,\s*)?)+)/);
        let issues = issueMatch
            ? [...issueMatch[1].matchAll(/#(\d+)/g)].map(m => parseInt(m[1]))
            : [];
        // Fallback : si pas de ligne Issues formelle, chercher les #NNN dans tout le bloc
        if (issues.length === 0) {
            issues = [...new Set([...block.matchAll(/#(\d+)/g)].map(m => parseInt(m[1])))];
        }
        const depMatch = block.match(/Dépend de\s*:\s*(.+)/);
        const dependsOn = depMatch
            ? depMatch[1].split(/[,;]/).map(s => s.trim()).filter(Boolean)
            : [];
        const summaryMatch = block.match(/Résumé\s*:\s*(.+)/);
        const summary = summaryMatch ? summaryMatch[1].trim() : "";
        // Inclure tous les groupes, même sans issues (jalons structurels)
        groups.push({ index: groups.length + 1, name: nameMatch[1].trim(), issues, summary, dependsOn });
    }
    return groups;
}

export const planGroups = derived(issueAnalysis, $a => $a.result ? parseGroups($a.result) : []);

export const issueStates = writable<Map<number, string>>(new Map());

export type PlanGroupWithInvalidations = PlanGroup & { invalidatedIssues: number[] };

export const planGroupsWithInvalidations = derived(
    [planGroups, issueStates],
    ([$groups, $states]) => $groups.map(g => ({
        ...g,
        invalidatedIssues: g.issues.filter(n => $states.get(n) === "closed")
    })) as PlanGroupWithInvalidations[]
);

export const hasInvalidatedSlots = derived(
    planGroupsWithInvalidations,
    $groups => $groups.some(g => g.invalidatedIssues.length > 0)
);

export type PlanGroupDeduped = PlanGroupWithInvalidations & {
    displayIssues: number[];
    hiddenIssues: Array<{ n: number; firstStep: number }>;
};

export const planGroupsDeduped = derived(
    planGroupsWithInvalidations,
    ($groups) => {
        const firstSeenStep = new Map<number, number>();
        return $groups.map(g => {
            const displayIssues = g.issues.filter(n => !firstSeenStep.has(n));
            displayIssues.forEach(n => firstSeenStep.set(n, g.index));
            const hiddenIssues = g.issues
                .filter(n => !displayIssues.includes(n))
                .map(n => ({ n, firstStep: firstSeenStep.get(n)! }));
            return { ...g, displayIssues, hiddenIssues } as PlanGroupDeduped;
        });
    }
);

export const clusterFocusedSymbol = writable<{ name: string; dir: string } | null>(null);

export type CoalCodeFocus = {
    issueNum: number;
    symbols: { key: string; dir: string; file?: string }[];
};
export const coalCodeFocus = writable<CoalCodeFocus | null>(null);

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
