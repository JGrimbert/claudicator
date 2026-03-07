import { writable } from "svelte/store";

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
