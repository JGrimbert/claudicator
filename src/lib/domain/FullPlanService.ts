/**
 * Service fullplan — opérations fetch pures, sans DOM ni stores Svelte.
 */
import type { FullPlanDetail } from "$lib/types/task";

export async function loadFullPlanDetail(fullPlanId: string): Promise<FullPlanDetail | null> {
    const res = await fetch(`/api/issues/groups/full-plans/${fullPlanId}`);
    if (!res.ok) return null;
    return res.json();
}

export async function closeFullPlanIssues(fullPlanId: string): Promise<{ ok: boolean; message?: string }> {
    const res = await fetch(`/api/issues/groups/full-plans/${fullPlanId}/close-issues`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message ?? "Erreur fermeture issues" };
    return { ok: true };
}

export async function repromptIssue(
    fullPlanId: string,
    issueNumber: number,
    extraContext: string
): Promise<Response> {
    return fetch(`/api/issues/groups/full-plans/${fullPlanId}/reprompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueNumber, extraContext }),
    });
}

export async function propagateFromIssue(fullPlanId: string, fromIssueNumber: number): Promise<Response> {
    return fetch(`/api/issues/groups/full-plans/${fullPlanId}/propagate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromIssueNumber }),
    });
}

export async function repromptAllStale(fullPlanId: string, staleIssueNumbers: number[]): Promise<Response> {
    return fetch(`/api/issues/groups/full-plans/${fullPlanId}/rerun-stale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staleIssueNumbers }),
    });
}

export async function writeTests(fullPlanId: string, issueNumber: number, patchName: string): Promise<Response> {
    return fetch(`/api/issues/groups/full-plans/${fullPlanId}/write-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueNumber, patchName }),
    });
}

export async function runTests(fullPlanId: string, issueNumber: number, patchName: string): Promise<Response> {
    return fetch(`/api/issues/groups/full-plans/${fullPlanId}/run-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueNumber, patchName }),
    });
}

export async function loadEvalDag(keyword: string, planId: string): Promise<any | null> {
    const res = await fetch(`/api/issues/groups/eval-dag/${keyword}?planId=${planId}`);
    if (!res.ok) return null;
    return res.json();
}
