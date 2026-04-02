/**
 * Service git — opérations fetch pures, sans DOM ni stores Svelte.
 */
import type { Task } from "$lib/types/task";

export type DiffResult = { diff: string; error?: string };
export type BranchResult = { branch?: string; error?: string };
export type CommitResult = { ok: boolean; error?: string };
export type CommitsAhead = { count: number; commits: { sha: string; message: string }[] };

export async function loadDiff(taskId: string): Promise<DiffResult> {
    const res = await fetch(`/api/tasks/${taskId}/diff`);
    const data = await res.json();
    if (data.error) return { diff: "", error: data.error };
    return { diff: data.diff ?? "" };
}

export async function createInitialCommit(taskId: string): Promise<BranchResult> {
    const res = await fetch(`/api/tasks/${taskId}/initial-commit`, { method: "POST" });
    const data = await res.json();
    if (data.error && res.status !== 409) return { error: data.error };
    return { branch: data.branch };
}

export async function commitChanges(taskId: string, message: string): Promise<CommitResult> {
    const res = await fetch(`/api/tasks/${taskId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
    });
    const data = await res.json();
    if (data.error) return { ok: false, error: data.error };
    return { ok: true };
}

export async function revertChanges(taskId: string): Promise<CommitResult> {
    const res = await fetch(`/api/tasks/${taskId}/revert`, { method: "POST" });
    const data = await res.json();
    if (data.error) return { ok: false, error: data.error };
    return { ok: true };
}

export async function pushBranch(taskId: string): Promise<{ task?: Task; error?: string }> {
    const res = await fetch(`/api/tasks/${taskId}/push`, { method: "POST" });
    const data = await res.json();
    if (data.error) return { error: data.error };
    return { task: data };
}

export async function mergeBranch(taskId: string): Promise<CommitResult> {
    const res = await fetch(`/api/tasks/${taskId}/merge`, { method: "POST" });
    const data = await res.json();
    if (data.error) return { ok: false, error: data.error };
    return { ok: true };
}

export async function loadCommitsAhead(taskId: string): Promise<CommitsAhead | null> {
    const res = await fetch(`/api/tasks/${taskId}/commits-ahead`);
    if (!res.ok) return null;
    return res.json();
}

export async function syncTask(taskId: string): Promise<Task | null> {
    const res = await fetch(`/api/tasks/${taskId}/sync`, { method: "POST" });
    const data = await res.json();
    if (!data || data.error) return null;
    return data;
}
