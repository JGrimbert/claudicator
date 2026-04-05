/**
 * SpecController — tâche en spécification : pas encore de plan, pas de branche.
 * Premier niveau conscient d'une issue (analogue à Simplex dans lolve).
 *
 * upgrade() → PlanController    si task.hasPlan
 *           → ImplController    si task.branch (plan sauté)
 *           → MergedController  si task.status === "merged"
 *           → FullPlanController si task.type === "fullplan"
 */

import { TaskController, type TaskDetailCallbacks } from "./TaskController.svelte";
import { PlanController } from "./PlanController.svelte";
import { ImplController } from "./ImplController.svelte";
import { MergedController } from "./MergedController.svelte";
import type { Task } from "$lib/types/task";
import { agentState } from "$lib/stores/agent";

export class SpecController extends TaskController {
    // ── État propre au niveau spécification ─────────────────────────────
    skippingPlan = $state(false);
    linkedIssueState = $state<"open" | "closed" | null>(null);
    closingIssue = $state(false);

    // ── currentStep (pour WorkflowBar) ───────────────────────────────────
    get currentStep(): number { return 0; }

    constructor(task: Task, cb: TaskDetailCallbacks, prev?: TaskController) {
        super(task, cb);
        if (prev instanceof SpecController) {
            this.linkedIssueState = prev.linkedIssueState;
        }
    }

    async init(): Promise<void> {
        if (this.task.issueNumber) {
            this.loadLinkedIssueState();
            this.loadIssueDetails();
        }
    }

    // ── Chargements ──────────────────────────────────────────────────────

    async loadLinkedIssueState(): Promise<void> {
        if (!this.task.issueNumber) return;
        this.linkedIssueState = null;
        try {
            const res = await fetch(`/api/issue?number=${this.task.issueNumber}`);
            if (res.ok) {
                const data = await res.json();
                this.linkedIssueState = data.state === "closed" ? "closed" : "open";
            }
        } catch { /* silencieux */ }
    }

    private async loadIssueDetails(): Promise<void> {
        if (!this.task.issueNumber) return;
        agentState.update(s => ({ ...s, status: "loading", plan: null }));
        try {
            const res = await fetch(`/api/issue?number=${this.task.issueNumber}`);
            const full = await res.json();
            agentState.update(s => ({
                ...s, issue: full, status: "idle", navigationStack: [],
                knownSubIssueNumbers: [...new Set([
                    ...s.knownSubIssueNumbers,
                    ...(full.subIssues?.map((si: any) => si.number) ?? [])
                ])]
            }));
        } catch {
            agentState.update(s => ({ ...s, status: "idle" }));
        }
    }

    // ── Actions ──────────────────────────────────────────────────────────

    async skipPlan(): Promise<void> {
        if (this.skippingPlan) return;
        this.skippingPlan = true; this.wfError = "";
        try {
            const res = await fetch(`/api/tasks/${this.task.id}/plan`, { method: "POST" });
            const data = await res.json();
            if (data.error) { this.wfError = data.error; return; }
            await this.cb.onloadtasks();
        } catch (e: any) {
            this.wfError = e.message;
        } finally { this.skippingPlan = false; }
    }

    async closeLinkedIssue(): Promise<void> {
        if (!this.task.issueNumber || this.closingIssue) return;
        this.closingIssue = true; this.wfError = "";
        try {
            const res = await fetch(`/api/issues/${this.task.issueNumber}/close`, { method: "POST" });
            const data = await res.json();
            if (data.error) { this.wfError = data.error; return; }
            this.linkedIssueState = "closed";
        } catch (e: any) {
            this.wfError = e.message;
        } finally { this.closingIssue = false; }
    }

    // ── Upgrade ──────────────────────────────────────────────────────────

    upgrade(updated: Task): TaskController {
        this.task = updated;
        if (updated.status === "merged") return new MergedController(updated, this.cb, this);
        if (updated.branch) return new ImplController(updated, this.cb, this);
        if (updated.hasPlan) return new PlanController(updated, this.cb, this);
        return this;
    }
}
