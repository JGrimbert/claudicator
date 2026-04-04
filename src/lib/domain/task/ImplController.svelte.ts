/**
 * ImplController — tâche avec branche créée.
 * Niveau "Apex" dans la hiérarchie : l'implémentation est en cours.
 * Gère les panneaux impl / commit / push.
 *
 * upgrade() → MergedController si task.status === "merged"
 */

import { TaskController, type TaskDetailCallbacks } from "./TaskController.svelte";
import { MergedController } from "./MergedController.svelte";
import type { Task, WfPanel } from "$lib/types/task";
import * as GitWorkflow from "$lib/domain/GitWorkflow";
import type { CommitsAhead } from "$lib/domain/GitWorkflow";
import { taskStore } from "$lib/domain/TaskStore.svelte";
import { planModeTask, issueListRefreshTick, taskRefreshTick, agentRunState } from "$lib/stores/agent";

export class ImplController extends TaskController {
    // ── Diff / commit ──────────────────────────────────────────────────────
    diffContent = $state<string | null>(null);
    diffLoading = $state(false);
    commitMsg = $state("");
    committing = $state(false);
    reverting = $state(false);
    revertConfirm = $state(false);

    // ── Push / merge ───────────────────────────────────────────────────────
    pushing = $state(false);
    commitsAhead = $state<CommitsAhead | null>(null);
    merging = $state(false);

    // ── Implémentation ─────────────────────────────────────────────────────
    markingImplemented = $state(false);
    taskDag = $state<{ steps: { id: number }[] } | null>(null);
    justFinished = $state(false);
    private _prevStatus = $state<string | null>(null);

    // ── Issue liée ─────────────────────────────────────────────────────────
    linkedIssueState = $state<"open" | "closed" | null>(null);
    closingIssue = $state(false);

    // ── Panel courant (dérivé du diff) ─────────────────────────────────────
    get currentStep(): number {
        if (this.diffLoading || this.diffContent === null) {
            if (this.task.status === "documentation" || this.task.status === "validation") return 3;
            return 1;
        }
        if (this.diffContent.trim()) return 2;
        return 3;
    }

    constructor(task: Task, cb: TaskDetailCallbacks, prev?: TaskController) {
        super(task, cb);
        // Carry-forward
        if (prev instanceof ImplController) {
            this.linkedIssueState = prev.linkedIssueState;
            this.diffContent = prev.diffContent;
            this.commitMsg = prev.commitMsg;
        }
        // Détection post-run : transition vers un statut "done"
        $effect(() => {
            const status = this.task.status;
            const wasDone = ["implementation", "documentation", "validation"].includes(this._prevStatus ?? "");
            const isDone = ["implementation", "documentation", "validation"].includes(status ?? "");
            if (!wasDone && isDone && this._prevStatus !== null) {
                this.justFinished = true;
                this.cb.onloadtaskssilent();
                setTimeout(() => { this.justFinished = false; }, 3000);
            }
            this._prevStatus = status;
        });
    }

    async init(): Promise<void> {
        await this.loadDiff();
        if (this.task.issueNumber) this.loadLinkedIssueState();
    }

    // ── Chargements ────────────────────────────────────────────────────────

    async loadDiff(): Promise<void> {
        this.diffLoading = true;
        this.diffContent = null;
        const t = taskStore.tasks.find(x => x.id === this.task.id) ?? this.task;
        if (t && !this.commitMsg) {
            this.commitMsg = `feat: ${t.issueNumber ? `#${t.issueNumber} ` : ""}${t.title.slice(0, 60)}`;
        }
        const result = await GitWorkflow.loadDiff(this.task.id);
        if (result.error) { this.wfError = result.error; this.diffLoading = false; return; }
        this.diffContent = result.diff;
        this.diffLoading = false;
        // Sélectionner automatiquement le bon panneau
        if (this.diffContent.trim()) this.selectedPanel = "commit";
        else { this.selectedPanel = "push"; this.loadCommitsAhead(); }
    }

    async loadCommitsAhead(): Promise<void> {
        this.commitsAhead = null;
        this.commitsAhead = await GitWorkflow.loadCommitsAhead(this.task.id);
    }

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

    // ── Actions commit ─────────────────────────────────────────────────────

    async commitChanges(): Promise<void> {
        if (!this.commitMsg.trim() || this.committing) return;
        this.committing = true; this.wfError = "";
        try {
            const result = await GitWorkflow.commitChanges(this.task.id, this.commitMsg.trim());
            if (!result.ok) { this.wfError = result.error ?? "Erreur commit"; return; }
            this.commitMsg = "";
            await this.loadDiff();
            await this.cb.onloadtaskssilent();
        } catch (e: any) {
            this.wfError = e.message;
        } finally { this.committing = false; }
    }

    async revertChanges(): Promise<void> {
        if (!this.revertConfirm) { this.revertConfirm = true; return; }
        this.revertConfirm = false; this.reverting = true; this.wfError = "";
        try {
            const result = await GitWorkflow.revertChanges(this.task.id);
            if (!result.ok) { this.wfError = result.error ?? "Erreur revert"; return; }
            await this.loadDiff();
            this.selectedPanel = "commit";
        } catch (e: any) {
            this.wfError = e.message;
        } finally { this.reverting = false; }
    }

    // ── Actions push / merge ───────────────────────────────────────────────

    async pushBranch(): Promise<void> {
        if (this.pushing) return;
        this.pushing = true; this.wfError = "";
        try {
            const result = await GitWorkflow.pushBranch(this.task.id);
            if (result.error) { this.wfError = result.error; return; }
            if (result.task) taskStore.tasks = taskStore.tasks.map(x => x.id === result.task!.id ? result.task! : x);
        } catch (e: any) {
            this.wfError = e.message;
        } finally { this.pushing = false; }
    }

    async mergeBranch(): Promise<void> {
        if (this.merging) return;
        this.merging = true; this.wfError = "";
        try {
            const result = await GitWorkflow.mergeBranch(this.task.id);
            if (!result.ok) { this.wfError = result.error ?? "Erreur merge"; return; }
            planModeTask.set(null);
            if (this.task.issueNumber) issueListRefreshTick.update(n => n + 1);
            taskRefreshTick.update(n => n + 1);
            this.cb.onclearselected();
            await this.cb.onloadtasks();
        } catch (e: any) {
            this.wfError = e.message;
        } finally { this.merging = false; }
    }

    // ── Action mark implemented ────────────────────────────────────────────

    async markImplemented(): Promise<void> {
        if (this.markingImplemented) return;
        this.markingImplemented = true;
        try {
            const res = await fetch(`/api/tasks/${this.task.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "validation" }),
            });
            if (res.ok) {
                taskStore.tasks = taskStore.tasks.map(x => x.id === this.task.id ? { ...x, status: "validation" } : x);
            }
        } catch { /* silencieux */ }
        finally { this.markingImplemented = false; }
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

    // ── Upgrade ─────────────────────────────────────────────────────────────

    upgrade(updated: Task): TaskController {
        this.task = updated;
        if (updated.status === "merged") return new MergedController(updated, this.cb, this);
        return this;
    }
}
