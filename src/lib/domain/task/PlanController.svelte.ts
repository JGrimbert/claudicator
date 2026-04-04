/**
 * PlanController — tâche avec un plan généré, mais sans branche git.
 * Niveau "entre Simplex et Apex" : l'issue est planifiée, prête à être implémentée.
 *
 * upgrade() → ImplController si task.branch
 */

import { TaskController, type TaskDetailCallbacks } from "./TaskController.svelte";
import { ImplController } from "./ImplController.svelte";
import { MergedController } from "./MergedController.svelte";
import type { Task } from "$lib/types/task";
import * as GitWorkflow from "$lib/domain/GitWorkflow";

export class PlanController extends TaskController {
    // ── État propre au niveau plan ───────────────────────────────────────
    planContent = $state<string | null>(null);
    planLoading = $state(false);
    branchCreating = $state(false);

    // ── Carry-forward depuis SpecController ─────────────────────────────
    linkedIssueState = $state<"open" | "closed" | null>(null);
    skippingPlan = $state(false);

    // ── currentStep (pour WorkflowBar) ───────────────────────────────────
    get currentStep(): number {
        if (!this.planContent) return 0;
        return 1;
    }

    constructor(task: Task, cb: TaskDetailCallbacks, prev?: TaskController) {
        super(task, cb);
        if (prev && "linkedIssueState" in prev) {
            this.linkedIssueState = (prev as any).linkedIssueState;
        }
    }

    async init(): Promise<void> {
        await this.loadPlan();
        if (this.planContent) this.selectedPanel = "implement";
    }

    // ── Chargements ──────────────────────────────────────────────────────

    async loadPlan(): Promise<void> {
        this.planLoading = true;
        this.planContent = null;
        try {
            const res = await fetch(`/api/tasks/${this.task.id}/plan`);
            const data = await res.json();
            this.planContent = data.content ?? null;
        } catch { this.planContent = null; }
        finally { this.planLoading = false; }
    }

    // ── Actions ──────────────────────────────────────────────────────────

    async createBranch(): Promise<void> {
        if (this.branchCreating) return;
        this.branchCreating = true; this.wfError = "";
        try {
            const result = await GitWorkflow.createInitialCommit(this.task.id);
            if (result.error) { this.wfError = result.error; return; }
            await this.cb.onloadtasks();
            // Après onloadtasks, le parent reçoit une task avec branch → upgrade()
        } catch (e: any) {
            this.wfError = e.message;
        } finally { this.branchCreating = false; }
    }

    async skipPlan(): Promise<void> {
        if (this.skippingPlan) return;
        this.skippingPlan = true; this.wfError = "";
        try {
            const res = await fetch(`/api/tasks/${this.task.id}/plan`, { method: "POST" });
            const data = await res.json();
            if (data.error) { this.wfError = data.error; return; }
            await this.cb.onloadtasks();
            await this.loadPlan();
            this.selectedPanel = "implement";
        } catch (e: any) {
            this.wfError = e.message;
        } finally { this.skippingPlan = false; }
    }

    // ── Upgrade ──────────────────────────────────────────────────────────

    upgrade(updated: Task): TaskController {
        this.task = updated;
        if (updated.status === "merged") return new MergedController(updated, this.cb, this);
        if (updated.branch) return new ImplController(updated, this.cb, this);
        return this;
    }
}
