/**
 * Service patches — opérations fetch pures, sans DOM ni stores Svelte.
 */
import type { PatchInfo, SandboxState, CommitAllProgress } from "$lib/types/task";

export async function loadPatches(taskId: string): Promise<PatchInfo[]> {
    const res = await fetch(`/api/tasks/${taskId}/patches`);
    if (!res.ok) return [];
    return res.json();
}

export async function checkPatchStaleness(taskId: string, current: PatchInfo[]): Promise<PatchInfo[]> {
    const res = await fetch(`/api/tasks/${taskId}/patches?check=1`);
    if (!res.ok) return current;
    const checked: PatchInfo[] = await res.json();
    return current.map(p => {
        const c = checked.find(c => c.name === p.name);
        return c ? { ...p, stale: c.stale } : p;
    });
}

export async function loadSandboxState(taskId: string): Promise<SandboxState | null> {
    const res = await fetch(`/api/tasks/${taskId}/patches/sandbox`);
    if (!res.ok) return null;
    return res.json();
}

export type SandboxResult = { applied: string[]; deps: Record<string, string[]>; error?: string };

export async function sandboxApply(taskId: string, patchName: string): Promise<SandboxResult | { dirty: true }> {
    const res = await fetch(`/api/tasks/${taskId}/patches/${encodeURIComponent(patchName)}/sandbox`, { method: "POST" });
    return res.json();
}

export async function sandboxUnapply(taskId: string, patchName: string): Promise<SandboxResult | { dirty: true }> {
    const res = await fetch(`/api/tasks/${taskId}/patches/${encodeURIComponent(patchName)}/sandbox`, { method: "DELETE" });
    return res.json();
}

export async function rejectPatch(taskId: string, patchName: string): Promise<void> {
    await fetch(`/api/tasks/${taskId}/patches/${encodeURIComponent(patchName)}`, { method: "DELETE" });
}

export async function applyPatch(taskId: string, patchName: string): Promise<{ ok: boolean; message?: string }> {
    const res = await fetch(`/api/tasks/${taskId}/patches/${encodeURIComponent(patchName)}/apply`, { method: "POST" });
    if (!res.ok) {
        const d = await res.json();
        return { ok: false, message: d.message ?? "Erreur apply" };
    }
    return { ok: true };
}

export async function loadPatchContent(taskId: string, patchName: string): Promise<string | null> {
    const res = await fetch(`/api/tasks/${taskId}/patches/${encodeURIComponent(patchName)}`);
    if (!res.ok) return null;
    return res.text();
}
