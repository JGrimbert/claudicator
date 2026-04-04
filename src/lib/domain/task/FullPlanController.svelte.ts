/**
 * FullPlanController — tâche de type "fullplan" : plan global multi-issues.
 * Niveau "Vertex" dans la hiérarchie : le niveau le plus riche.
 * Étend ImplController pour hériter des capacités commit / push / merge.
 *
 * Gère : patches, sandbox, issue tree, reprompt, tests, commit-all.
 * upgrade() → MergedController si task.status === "merged"
 */

import { ImplController } from "./ImplController.svelte";
import { MergedController } from "./MergedController.svelte";
import { TaskController, type TaskDetailCallbacks } from "./TaskController.svelte";
import type {
    Task, IssueRow, IssueRef, IssueState, PatchInfo,
    FullPlanDetail, SandboxState, CommitAllProgress
} from "$lib/types/task";
import * as PatchService from "$lib/domain/PatchService";
import * as FullPlanService from "$lib/domain/FullPlanService";
import {
    agentRunState, activeFullPlan, startConsoleStream,
    testRunState, consoleTab, type TestLog
} from "$lib/stores/agent";

export class FullPlanController extends ImplController {
    // ── Détail du fullplan ─────────────────────────────────────────────
    fullPlanDetail = $state<FullPlanDetail | null>(null);
    closingIssues = $state(false);

    // ── Patches ────────────────────────────────────────────────────────
    patches = $state<PatchInfo[]>([]);
    selectedPatch = $state<PatchInfo | null>(null);
    patchContent = $state<string | null>(null);
    patchLoading = $state(false);
    patchApplying = $state(false);

    // ── Commit-all ─────────────────────────────────────────────────────
    commitAllBusy = $state(false);
    commitAllProgress = $state<CommitAllProgress | null>(null);

    // ── Sandbox ────────────────────────────────────────────────────────
    sandboxState = $state<SandboxState | null>(null);
    sandboxError = $state("");
    sandboxBusy = $state<string | null>(null);

    // ── Reprompt ───────────────────────────────────────────────────────
    repromptBusy = $state<number | null>(null);

    // ── Issue sélectionnée dans l'arbre ───────────────────────────────
    selectedIssueRow = $state<IssueRow | null>(null);
    selectedIssueDetail = $state<{ title: string; body: string } | null>(null);
    loadingIssueDetail = $state(false);

    // ── Rows dérivées ─────────────────────────────────────────────────
    get issueRows(): IssueRow[] {
        const fp = this.fullPlanDetail;
        if (!fp) return [];
        const rows: IssueRow[] = [];
        const findPatch = (num: number) =>
            this.patches.find(p => p.issueNumbers?.includes(num) ?? p.issueNumber === num);

        if (fp.stepFiles?.length) {
            const titleMap = new Map<number, string>();
            for (const s of fp.subStacks) for (const i of s.issues) titleMap.set(i.number, i.title);
            for (const i of (fp.residualIssues ?? [])) titleMap.set(i.number, i.title);
            for (const sf of fp.stepFiles) {
                const stepLabel = sf.filename.replace(".md", "");
                for (const num of sf.issues) {
                    const patch = findPatch(num);
                    const state: IssueState = patch ? (patch.hasTests ? "patch-tests" : "patch-no-tests") : "no-patch";
                    rows.push({ number: num, title: titleMap.get(num) ?? `#${num}`, stack: stepLabel, state, patch });
                }
            }
        } else {
            for (const stack of fp.subStacks) {
                for (const issue of stack.issues) {
                    const patch = findPatch(issue.number);
                    const state: IssueState = patch ? (patch.hasTests ? "patch-tests" : "patch-no-tests") : "no-patch";
                    rows.push({ ...issue, stack: stack.keyword, state, patch });
                }
            }
            for (const issue of (fp.residualIssues ?? [])) {
                const patch = findPatch(issue.number);
                const state: IssueState = patch ? (patch.hasTests ? "patch-tests" : "patch-no-tests") : "no-patch";
                rows.push({ ...issue, stack: "résiduel", state, patch });
            }
        }
        return rows;
    }

    get staleRows(): IssueRow[] {
        return this.issueRows.filter(r => r.patch?.stale);
    }

    constructor(task: Task, cb: TaskDetailCallbacks, prev?: TaskController) {
        super(task, cb, prev);
    }

    async init(): Promise<void> {
        if (!this.task.fullPlanId) return;
        await this.loadFullPlanDetail();
        await this.loadPatches();
        await this.loadSandboxState();

        if (this.task.branch) {
            await this.loadDiff();
            if (this.diffContent?.trim()) this.selectedPanel = "commit";
            else { this.selectedPanel = "push"; this.loadCommitsAhead(); }
        } else if (this.task.status === "validation" || this.task.status === "merged") {
            this.selectedPanel = "push";
        }
    }

    // ── Chargements ───────────────────────────────────────────────────

    async loadFullPlanDetail(): Promise<void> {
        if (!this.task.fullPlanId) return;
        const fp = await FullPlanService.loadFullPlanDetail(this.task.fullPlanId);
        if (fp) {
            this.fullPlanDetail = fp;
            activeFullPlan.set({ id: fp.id, keyword: fp.keyword ?? "", status: (fp.status as any) ?? "done", planFile: fp.planFile, taskId: this.task.id });
            if (fp.keyword && fp.id) {
                FullPlanService.loadEvalDag(fp.keyword, fp.id)
                    .then(data => {
                        if (data?.exists && data.levels?.length) {
                            this.taskDag = { steps: data.levels.flatMap((l: any) => l.issues.map((n: number) => ({ id: n }))) };
                        }
                    })
                    .catch(() => {});
            }
        } else {
            activeFullPlan.set({ id: this.task.fullPlanId!, keyword: "", status: "error", taskId: this.task.id });
        }
    }

    async loadPatches(): Promise<void> {
        this.patches = await PatchService.loadPatches(this.task.id);
        this.patches = await PatchService.checkPatchStaleness(this.task.id, this.patches);
    }

    async loadSandboxState(): Promise<void> {
        this.sandboxState = await PatchService.loadSandboxState(this.task.id);
    }

    // ── Actions patches ───────────────────────────────────────────────

    async openPatch(patch: PatchInfo): Promise<void> {
        this.selectedPatch = patch;
        this.patchContent = null;
        this.patchLoading = true;
        this.selectedPanel = "patch";
        this.patchContent = await PatchService.loadPatchContent(this.task.id, patch.name);
        this.patchLoading = false;
    }

    async applySelectedPatch(): Promise<void> {
        if (!this.selectedPatch || this.patchApplying) return;
        this.patchApplying = true; this.wfError = "";
        const result = await PatchService.applyPatch(this.task.id, this.selectedPatch.name);
        if (!result.ok) this.wfError = result.message ?? "Erreur apply";
        this.patchApplying = false;
    }

    async rejectPatch(patch: PatchInfo): Promise<void> {
        await PatchService.rejectPatch(this.task.id, patch.name);
        if (this.selectedPatch?.name === patch.name) {
            this.selectedPatch = null; this.patchContent = null; this.selectedPanel = "plan";
        }
        await this.loadPatches();
        await this.cb.onloadtaskssilent();
    }

    // ── Actions sandbox ───────────────────────────────────────────────

    async sandboxApply(patchName: string): Promise<void> {
        if (this.sandboxBusy) return;
        this.sandboxBusy = patchName; this.sandboxError = "";
        const result = await PatchService.sandboxApply(this.task.id, patchName);
        if ("dirty" in result) {
            this.sandboxError = "Le repo n'est pas clean — commite ou stashe tes modifications.";
        } else if (result.error) {
            this.sandboxError = result.message ?? "Erreur apply";
        } else {
            this.sandboxState = { applied: result.applied, deps: this.sandboxState?.deps ?? {} };
        }
        this.sandboxBusy = null;
    }

    async sandboxUnapply(patchName: string): Promise<void> {
        if (this.sandboxBusy) return;
        this.sandboxBusy = patchName; this.sandboxError = "";
        const result = await PatchService.sandboxUnapply(this.task.id, patchName);
        if ("dirty" in result) {
            this.sandboxError = "Le repo n'est pas clean — commite ou stashe tes modifications.";
        } else if ((result as any).error) {
            this.sandboxError = (result as any).message ?? "Erreur unapply";
        } else {
            this.sandboxState = { applied: (result as any).applied, deps: this.sandboxState?.deps ?? {} };
        }
        this.sandboxBusy = null;
    }

    // ── Actions issue tree ────────────────────────────────────────────

    async selectIssueRow(row: IssueRow): Promise<void> {
        this.selectedIssueRow = row;
        this.selectedIssueDetail = null;
        this.loadingIssueDetail = true;
        try {
            const res = await fetch(`/api/issue?number=${row.number}`);
            if (res.ok) {
                const data = await res.json();
                this.selectedIssueDetail = { title: data.title ?? row.title, body: data.body ?? "" };
            }
        } catch { /* ignore */ }
        finally { this.loadingIssueDetail = false; }
    }

    async closeFullPlanIssues(): Promise<void> {
        if (!this.task.fullPlanId || this.closingIssues) return;
        this.closingIssues = true; this.wfError = "";
        const result = await FullPlanService.closeFullPlanIssues(this.task.fullPlanId);
        if (!result.ok) this.wfError = result.message ?? "Erreur fermeture issues";
        this.closingIssues = false;
    }

    // ── Actions agent (reprompt / tests) ──────────────────────────────

    async repromptIssue(row: IssueRow): Promise<void> {
        if (!this.task.fullPlanId) return;
        const extraContext = window.prompt(`Contexte supplémentaire pour #${row.number} — ${row.title} :\n(laisser vide pour relancer tel quel)`) ?? "";
        this.repromptBusy = row.number;
        agentRunState.update(s => ({
            ...s, taskId: this.task.id, taskTitle: `Reprompt — #${row.number} ${row.title}`,
            logs: [], running: true, sessionAlive: false,
        }));
        try {
            const res = await FullPlanService.repromptIssue(this.task.fullPlanId, row.number, extraContext);
            await startConsoleStream(res);
            await this.loadPatches();
            await this.cb.onloadtaskssilent();
            agentRunState.update(s => ({ ...s, running: true, logs: [...s.logs, { line: "[propagation] inspection des patches suivants...", type: "system" as const }] }));
            const propRes = await FullPlanService.propagateFromIssue(this.task.fullPlanId, row.number);
            await startConsoleStream(propRes, { onDone: async () => { await this.loadPatches(); await this.cb.onloadtaskssilent(); } });
        } catch (e: any) {
            agentRunState.update(s => ({ ...s, running: false, logs: [...s.logs, { line: `[erreur] ${e.message}`, type: "system" as const }] }));
        } finally { this.repromptBusy = null; }
    }

    async repromptAllStale(): Promise<void> {
        if (!this.task.fullPlanId || !this.staleRows.length) return;
        const n = this.staleRows.length;
        agentRunState.update(s => ({
            ...s, taskId: this.task.id, taskTitle: `Régénération — ${n} patch${n > 1 ? "s" : ""} périmé${n > 1 ? "s" : ""}`,
            logs: [], running: true, sessionAlive: false,
        }));
        try {
            const res = await FullPlanService.repromptAllStale(this.task.fullPlanId, this.staleRows.map(r => r.number));
            await startConsoleStream(res, { onDone: async () => { await this.loadPatches(); await this.cb.onloadtaskssilent(); } });
        } catch (e: any) {
            agentRunState.update(s => ({ ...s, running: false, logs: [...s.logs, { line: `[erreur] ${e.message}`, type: "system" as const }] }));
        } finally { this.repromptBusy = null; }
    }

    async writeTests(row: IssueRow): Promise<void> {
        if (!this.task.fullPlanId || !row.patch) return;
        agentRunState.update(s => ({
            ...s, taskId: this.task.id, taskTitle: `Tests — #${row.number} ${row.title}`,
            logs: [], running: true, sessionAlive: false,
        }));
        try {
            const res = await FullPlanService.writeTests(this.task.fullPlanId, row.number, row.patch.name);
            await startConsoleStream(res, { onDone: async () => { await this.loadPatches(); await this.cb.onloadtaskssilent(); } });
        } catch (e: any) {
            agentRunState.update(s => ({ ...s, running: false, logs: [...s.logs, { line: `[erreur] ${e.message}`, type: "system" }] }));
        }
    }

    async runTests(row: IssueRow): Promise<void> {
        if (!this.task.fullPlanId || !row.patch) return;
        testRunState.set({ planId: this.task.fullPlanId, issueNumber: row.number, logs: [], running: true, exitCode: null });
        consoleTab.set("tests");
        try { sessionStorage.setItem("lastConsoleTab", "tests"); } catch { /* SSR */ }
        try {
            const res = await FullPlanService.runTests(this.task.fullPlanId, row.number, row.patch.name);
            if (!res.ok || !res.body) {
                const msg = await res.text().catch(() => `HTTP ${res.status}`);
                testRunState.update(s => ({ ...s, running: false, exitCode: 1, logs: [...s.logs, { line: msg, type: "sys" as const }] }));
                return;
            }
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                for (const raw of dec.decode(value).split("\n")) {
                    if (!raw.startsWith("data: ")) continue;
                    try {
                        const ev = JSON.parse(raw.slice(6));
                        if (ev.type === "exit") {
                            testRunState.update(s => {
                                const next = { ...s, running: false, exitCode: ev.code };
                                try { sessionStorage.setItem("lastTestRun", JSON.stringify(next)); } catch { /* SSR */ }
                                return next;
                            });
                        } else {
                            testRunState.update(s => ({ ...s, logs: [...s.logs, { line: ev.line, type: ev.type as TestLog["type"] }] }));
                        }
                    } catch { /* ligne malformée */ }
                }
            }
        } catch (e: any) {
            testRunState.update(s => {
                const next = { ...s, running: false, exitCode: 1, logs: [...s.logs, { line: `[erreur] ${e.message}`, type: "sys" as const }] };
                try { sessionStorage.setItem("lastTestRun", JSON.stringify(next)); } catch { /* SSR */ }
                return next;
            });
        }
    }

    // ── Commit-all patches ────────────────────────────────────────────

    async commitAllPatches(): Promise<void> {
        if (this.commitAllBusy) return;
        this.commitAllBusy = true;
        this.commitAllProgress = { done: 0, total: this.patches.length, current: "" };
        try {
            const res = await fetch(`/api/tasks/${this.task.id}/commit-all-patches`, { method: "POST" });
            if (!res.ok || !res.body) {
                this.commitAllProgress = { ...this.commitAllProgress!, error: await res.text() };
                return;
            }
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            let buf = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const events = buf.split("\n\n");
                buf = events.pop() ?? "";
                for (const ev of events) {
                    const line = ev.replace(/^data: /, "").trim();
                    if (!line) continue;
                    try {
                        const obj = JSON.parse(line);
                        if (obj.type === "branch") this.commitAllProgress = { ...this.commitAllProgress!, branch: obj.name };
                        else if (obj.type === "applying") this.commitAllProgress = { ...this.commitAllProgress!, current: obj.patch, done: obj.index - 1, total: obj.total };
                        else if (obj.type === "applied") this.commitAllProgress = { ...this.commitAllProgress!, done: this.commitAllProgress!.done + 1 };
                        else if (obj.type === "done") {
                            this.commitAllProgress = { ...this.commitAllProgress!, done: obj.total, current: "", branch: obj.branch };
                            await this.cb.onloadtaskssilent();
                            const updated = (await import("$lib/domain/TaskStore.svelte")).taskStore.tasks.find(x => x.id === this.task.id);
                            if (updated) await this.cb.onselecttask(updated, true);
                        }
                        else if (obj.type === "error") this.commitAllProgress = { ...this.commitAllProgress!, error: obj.message ?? "Erreur inconnue" };
                    } catch { /* JSON partiel */ }
                }
            }
        } finally { this.commitAllBusy = false; }
    }

    // ── Upgrade ───────────────────────────────────────────────────────

    override upgrade(updated: Task): TaskController {
        this.task = updated;
        if (updated.status === "merged") return new MergedController(updated, this.cb, this);
        return this;
    }
}
