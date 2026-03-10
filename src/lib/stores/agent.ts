import { writable, derived } from "svelte/store";

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

export type RunLog = { line: string; type: "agent" | "system" | "usage" };

export const agentRunState = writable<{
    taskId: string | null;
    taskTitle: string;
    logs: RunLog[];
    running: boolean;
}>({
    taskId: null,
    taskTitle: "",
    logs: [],
    running: false,
});

export const taskRefreshTick = writable(0);
export function notifyTaskCreated() { taskRefreshTick.update(n => n + 1); }

export const hoveredIssueNumber = writable<number | null>(null);

export const issueAnalysis = writable<{
    running: boolean;
    result: string | null;
    logs: RunLog[];
    snapshotDiff: {
        added: number[];
        removed: number[];
        modified: number[];
    } | null;
}>({ running: false, result: null, logs: [], snapshotDiff: null });

export const projectUsage = writable<{ totalInputTokens: number; totalOutputTokens: number } | null>(null);

export const planModeTask = writable<{ id: string; title: string } | null>(null);

export const planAllState = writable<{
    running: boolean;
    currentTaskId: string | null;
}>({ running: false, currentTaskId: null });

export type PlanGroup = { index: number; name: string; issues: number[] };

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

export type Log = {
    ts: string;
    level: "INFO" | "SUCCESS" | "ERROR";
    message: string;
};

export type SubIssue = {
    number: number;
    title: string;
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
