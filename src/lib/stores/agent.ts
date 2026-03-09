import { writable } from "svelte/store";

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

export const projectUsage = writable<{ totalInputTokens: number; totalOutputTokens: number } | null>(null);

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
