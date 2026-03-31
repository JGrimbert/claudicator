/**
 * Tests étape 3 — Issue #91
 * POST /api/tasks/[id]/merged : supprime la tâche associée après merge de branche
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/server/services/tasks", () => ({
    getTask: vi.fn(),
    deleteTask: vi.fn(),
}));

import { getTask, deleteTask } from "$lib/server/services/tasks";

// Import dynamique de l'handler après les mocks
async function getHandler() {
    const mod = await import("./+server");
    return mod;
}

describe("POST /api/tasks/[id]/merged — Issue #91", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("retourne 404 si la task n'existe pas", async () => {
        vi.mocked(getTask).mockReturnValue(null);
        const { POST } = await getHandler();
        const res = await POST({ params: { id: "inexistant" } } as any);
        const body = await res.json();
        expect(res.status).toBe(404);
        expect(body.error).toBeTruthy();
    });

    it("supprime la task et retourne ok si elle existe", async () => {
        const task = { id: "abc", title: "Test", status: "validation", logs: [], createdAt: "", updatedAt: "" };
        vi.mocked(getTask).mockReturnValue(task as any);
        vi.mocked(deleteTask).mockReturnValue(true);
        const { POST } = await getHandler();
        const res = await POST({ params: { id: "abc" } } as any);
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.ok).toBe(true);
        expect(deleteTask).toHaveBeenCalledWith("abc");
    });

    it("retourne ok:false si deleteTask échoue", async () => {
        const task = { id: "xyz", title: "Test", status: "validation", logs: [], createdAt: "", updatedAt: "" };
        vi.mocked(getTask).mockReturnValue(task as any);
        vi.mocked(deleteTask).mockReturnValue(false);
        const { POST } = await getHandler();
        const res = await POST({ params: { id: "xyz" } } as any);
        const body = await res.json();
        // L'endpoint doit signaler l'échec
        expect(body.ok).toBe(false);
    });
});
