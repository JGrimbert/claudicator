/**
 * TaskController — classe de base pour tous les contrôleurs de tâche.
 *
 * Architecture : hiérarchie plate inspirée du pattern upgrade() de lolve.
 *
 *   SpecController    ← specification (sans plan, sans branche)
 *   PlanController    ← a un plan, sans branche
 *   ImplController    ← branche créée (gère impl / commit / push)
 *   MergedController  ← état terminal
 *   FullPlanController ← type fullplan (extends ImplController)
 *
 * La factory `createController(task, cb)` est dans index.svelte.ts.
 */

import type { Task, WfPanel } from "$lib/types/task";

// ── Callbacks vers le composant parent ──────────────────────────────────────

export type TaskDetailCallbacks = {
    onloadtasks: () => Promise<void>;
    onloadtaskssilent: () => Promise<void>;
    onselecttask: (task: Task, silent?: boolean) => Promise<void>;
    onclearselected: () => void;
};

// ── Classe de base ───────────────────────────────────────────────────────────

export class TaskController {
    wfError = $state("");
    selectedPanel = $state<WfPanel>("plan");
    centralInput = $state("");
    sendingCentralInput = $state(false);
    resetting = $state(false);

    constructor(
        public task: Task,
        public cb: TaskDetailCallbacks,
    ) {}

    /** Appelée une fois après création : chargements initiaux async. */
    async init(): Promise<void> {}

    /**
     * Contrôle si la task a évolué et retourne le contrôleur du niveau suivant.
     * Retourne `this` si aucun upgrade n'est nécessaire.
     * Implémenté par chaque sous-classe.
     */
    upgrade(updated: Task): TaskController {
        this.task = updated;
        return this;
    }

    /** Réinitialise la task à "specification" depuis n'importe quel état bloqué. */
    async reset(): Promise<void> {
        if (this.resetting) return;
        this.resetting = true;
        try {
            const res = await fetch(`/api/tasks/${this.task.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "specification" }),
            });
            const data = await res.json();
            if (!data.error) await this.cb.onloadtasks();
        } finally { this.resetting = false; }
    }

    async sendInput(): Promise<void> {
        const trimmed = this.centralInput.trim();
        if (!trimmed || this.sendingCentralInput) return;
        this.sendingCentralInput = true;
        try {
            await fetch("/api/agent/input", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input: trimmed, taskId: this.task.id }),
            });
            this.centralInput = "";
        } catch { /* silencieux */ }
        finally { this.sendingCentralInput = false; }
    }
}
