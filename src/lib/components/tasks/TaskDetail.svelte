<script lang="ts">
import { onMount, onDestroy } from "svelte";
import { agentRunState, hoveredIssueNumber, activeFullPlan } from "$lib/stores/agent";
import { getInitialConsoleTab } from "./TaskList.helpers";
import { taskStore } from "$lib/domain/TaskStore.svelte.ts";
import type { Task } from "$lib/types/task";
import {
    createController,
    type TaskDetailCallbacks,
    TaskController,
    SpecController,
    PlanController,
    ImplController,
    MergedController,
    FullPlanController,
} from "$lib/domain/task/index.svelte";
import FullPlanIssueTree from "../issues/FullPlanIssueTree.svelte";
import WorkflowBar from "../shell/WorkflowBar.svelte";
import TaskPlanPanel from "../shell/TaskPlanPanel.svelte";
import ImplementPanel from "../actions/ImplementPanel.svelte";
import CommitPanel from "../actions/CommitPanel.svelte";
import PushMergePanel from "../actions/PushMergePanel.svelte";
import PatchViewer from "../actions/PatchViewer.svelte";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface Props {
    task: Task;
    onloadtasks: () => Promise<void>;
    onloadtaskssilent: () => Promise<void>;
    onselecttask: (task: Task, silent?: boolean) => Promise<void>;
    onclearselected: () => void;
    onremove: (task: Task) => Promise<void>;
}
let { task, onloadtasks, onloadtaskssilent, onselecttask, onclearselected, onremove }: Props = $props();

// ── Spinner braille ────────────────────────────────────────────────────────
let frame = $state(0);
let spinnerInterval: ReturnType<typeof setInterval> | null = null;
onMount(() => { spinnerInterval = setInterval(() => { frame = (frame + 1) % FRAMES.length; }, 80); });
onDestroy(() => { if (spinnerInterval) clearInterval(spinnerInterval); });

// ── Callbacks vers le parent ───────────────────────────────────────────────
const cb: TaskDetailCallbacks = {
    get onloadtasks() { return onloadtasks; },
    get onloadtaskssilent() { return onloadtaskssilent; },
    get onselecttask() { return onselecttask; },
    get onclearselected() { return onclearselected; },
};

// ── Contrôleur actif ───────────────────────────────────────────────────────
// createController() retourne le niveau adapté à l'état courant de la task.
// upgrade() fait progresser le contrôleur quand la task évolue.
let ctrl = $state<TaskController>(createController(task, cb));
let _ctrlInitialized = false;

$effect(() => {
    const id = task.id;
    if (ctrl.task.id !== id || !_ctrlInitialized) {
        // Nouvelle task sélectionnée ou premier montage — contrôleur frais + init
        if (ctrl.task.id !== id) ctrl = createController(task, cb);
        _ctrlInitialized = true;
        ctrl.init();
        return;
    }
    // Même task : vérifier si un upgrade est possible
    const next = ctrl.upgrade(task);
    if (next !== ctrl) {
        ctrl = next;
        ctrl.init();
    }
});

// ── Polling patches pendant un run fullplan ────────────────────────────────
let _patchPoll: ReturnType<typeof setInterval> | null = null;
$effect(() => {
    if (!$agentRunState.running || !$agentRunState.taskId) {
        if (_patchPoll) { clearInterval(_patchPoll); _patchPoll = null; }
        return;
    }
    const runningTask = taskStore.tasks.find(t => t.fullPlanId === $agentRunState.taskId);
    if (!runningTask || runningTask.id !== task.id) {
        if (_patchPoll) { clearInterval(_patchPoll); _patchPoll = null; }
        return;
    }
    if (!_patchPoll && ctrl instanceof FullPlanController) {
        _patchPoll = setInterval(() => (ctrl as FullPlanController).loadPatches(), 2500);
    }
});
onDestroy(() => { if (_patchPoll) clearInterval(_patchPoll); });

// ── Helpers de type pour le template ──────────────────────────────────────
function asSpec(c: TaskController): SpecController { return c as SpecController; }
function asPlan(c: TaskController): PlanController { return c as PlanController; }
function asImpl(c: TaskController): ImplController { return c as ImplController; }
function asFP(c: TaskController): FullPlanController { return c as FullPlanController; }
</script>

<div class="inline-detail">

    {#if ctrl instanceof MergedController}
        <!-- ── Task mergée ────────────────────────────────────────────── -->
        <div class="merged-panel">
            <span class="merged-badge">✓ Mergée</span>
            {#if task.branch}
                <span class="merged-branch">{task.branch}</span>
            {/if}
            {#if task.issueNumber}
                <span class="merged-issue">#{task.issueNumber}</span>
            {/if}
            <button class="merged-delete" onclick={() => onremove(task)} title="Supprimer cette task">✕ Supprimer</button>
        </div>

    {:else if ctrl instanceof FullPlanController}
        <!-- ── Task fullplan ──────────────────────────────────────────── -->
        {@const fp = asFP(ctrl)}

        {#if fp.fullPlanDetail && fp.issueRows.length > 0 && task.status !== "validation" && task.status !== "merged"}
            <FullPlanIssueTree
                {task}
                fullPlanDetail={fp.fullPlanDetail}
                issueRows={fp.issueRows}
                staleRows={fp.staleRows}
                selectedIssueRow={fp.selectedIssueRow}
                selectedIssueDetail={fp.selectedIssueDetail}
                loadingIssueDetail={fp.loadingIssueDetail}
                sandboxState={fp.sandboxState}
                sandboxError={fp.sandboxError}
                sandboxBusy={fp.sandboxBusy}
                repromptBusy={fp.repromptBusy}
                patches={fp.patches}
                commitAllBusy={fp.commitAllBusy}
                commitAllProgress={fp.commitAllProgress}
                closingIssues={fp.closingIssues}
                onselectissuerow={(row) => fp.selectIssueRow(row)}
                onsandboxapply={(name) => fp.sandboxApply(name)}
                onsandboxunapply={(name) => fp.sandboxUnapply(name)}
                onreprompt={(row) => fp.repromptIssue(row)}
                onrepromptallstale={() => fp.repromptAllStale()}
                onwritetests={(row) => fp.writeTests(row)}
                onruntests={(row) => fp.runTests(row)}
                oncommitall={() => fp.commitAllPatches()}
                oncloseissues={() => fp.closeFullPlanIssues()}
                onrejectpatch={(p) => fp.rejectPatch(p)}
                onclearsandboxerror={() => fp.sandboxError = ""}
            />
        {/if}

        <WorkflowBar
            {task}
            currentStep={fp.currentStep}
            branchCreating={fp.branchCreating}
            onselectpanel={(p) => fp.selectedPanel = p}
            oncreatebranchanddiff={() => fp.createBranch()}
            onloadcommitsahead={() => fp.loadCommitsAhead()}
        />

        {#if fp.wfError}
            <div class="wf-error">{fp.wfError}</div>
        {/if}

        {#if $agentRunState.running && $agentRunState.taskId === task.id}
            <div class="central-input-bar">
                <input class="central-input" placeholder="Envoyer un message à l'agent…"
                    bind:value={fp.centralInput}
                    disabled={fp.sendingCentralInput}
                    onkeydown={(e) => e.key === "Enter" && fp.sendInput()}
                />
                <button class="central-input-send"
                    onclick={() => fp.sendInput()}
                    disabled={fp.sendingCentralInput || !fp.centralInput.trim()}
                >{fp.sendingCentralInput ? "…" : "↵"}</button>
            </div>
        {/if}

        {#if fp.selectedPanel === "commit"}
            <CommitPanel
                diffContent={fp.diffContent}
                diffLoading={fp.diffLoading}
                commitMsg={fp.commitMsg}
                committing={fp.committing}
                reverting={fp.reverting}
                revertConfirm={fp.revertConfirm}
                oncommitmsgchange={(msg) => fp.commitMsg = msg}
                oncommit={() => fp.commitChanges()}
                onrevert={() => fp.revertChanges()}
                onreloaddiff={() => fp.loadDiff()}
            />
        {:else if fp.selectedPanel === "push"}
            <PushMergePanel
                {task}
                commitsAhead={fp.commitsAhead}
                pushing={fp.pushing}
                merging={fp.merging}
                linkedIssueState={fp.linkedIssueState}
                closingIssue={fp.closingIssue}
                closingIssues={fp.closingIssues}
                issueRows={fp.issueRows}
                spinnerFrame={FRAMES[frame]}
                onpush={() => fp.pushBranch()}
                onmerge={() => fp.mergeBranch()}
                oncloseissue={() => fp.closeLinkedIssue()}
                oncloseissues={() => fp.closeFullPlanIssues()}
            />
        {/if}

        {#if fp.selectedPanel === "patch" && fp.selectedPatch}
            <PatchViewer
                selectedPatch={fp.selectedPatch}
                patchContent={fp.patchContent}
                patchLoading={fp.patchLoading}
                patchApplying={fp.patchApplying}
                onapply={() => fp.applySelectedPatch()}
                onreject={() => fp.rejectPatch(fp.selectedPatch!)}
            />
        {/if}

    {:else}
        <!-- ── Task standard (spec / plan / impl) ─────────────────────── -->

        {#if task.status === "planification" || task.status === "failed"}
            <div class="stuck-bar">
                <span class="stuck-label">{task.status === "planification" ? "⚠ agent inactif — task bloquée" : "✕ échec"}</span>
                <button class="stuck-reset"
                    onclick={() => (ctrl as SpecController).reset()}
                    disabled={(ctrl as SpecController).resetting}
                >{(ctrl as SpecController).resetting ? "…" : "↺ Réinitialiser → spécification"}</button>
            </div>
        {/if}

        <WorkflowBar
            {task}
            currentStep={ctrl instanceof ImplController ? ctrl.currentStep : ctrl instanceof PlanController ? ctrl.currentStep : 0}
            branchCreating={ctrl instanceof PlanController ? ctrl.branchCreating : false}
            onselectpanel={(p) => ctrl.selectedPanel = p}
            oncreatebranchanddiff={() => ctrl instanceof PlanController && ctrl.createBranch()}
            onloadcommitsahead={() => ctrl instanceof ImplController && ctrl.loadCommitsAhead()}
        />

        {#if ctrl.wfError}
            <div class="wf-error">{ctrl.wfError}</div>
        {/if}

        {#if $agentRunState.running && $agentRunState.taskId === task.id}
            <div class="central-input-bar">
                <input class="central-input" placeholder="Envoyer un message à l'agent…"
                    bind:value={ctrl.centralInput}
                    disabled={ctrl.sendingCentralInput}
                    onkeydown={(e) => e.key === "Enter" && ctrl.sendInput()}
                />
                <button class="central-input-send"
                    onclick={() => ctrl.sendInput()}
                    disabled={ctrl.sendingCentralInput || !ctrl.centralInput.trim()}
                >{ctrl.sendingCentralInput ? "…" : "↵"}</button>
            </div>
        {/if}

        {#if ctrl.selectedPanel === "plan"}
            <TaskPlanPanel
                {task}
                planContent={ctrl instanceof PlanController ? ctrl.planContent : null}
                planLoading={ctrl instanceof PlanController ? ctrl.planLoading : false}
                skippingPlan={ctrl instanceof SpecController || ctrl instanceof PlanController ? (ctrl as any).skippingPlan : false}
                onskipplan={() => (ctrl instanceof SpecController || ctrl instanceof PlanController) && (ctrl as any).skipPlan()}
            />
        {:else if ctrl.selectedPanel === "implement" && ctrl instanceof PlanController}
            <ImplementPanel
                {task}
                diffContent={null}
                diffLoading={false}
                branchCreating={ctrl.branchCreating}
                justFinished={false}
                taskDag={null}
                markingImplemented={false}
                agentRunning={$agentRunState.running}
                onselectpanel={(p) => ctrl.selectedPanel = p}
                oncreatebranchanddiff={() => asPlan(ctrl).createBranch()}
                onmarkimplemented={() => {}}
                onloaddiff={() => {}}
            />
        {:else if ctrl.selectedPanel === "implement" && ctrl instanceof ImplController}
            <ImplementPanel
                {task}
                diffContent={ctrl.diffContent}
                diffLoading={ctrl.diffLoading}
                branchCreating={false}
                justFinished={ctrl.justFinished}
                taskDag={ctrl.taskDag}
                markingImplemented={ctrl.markingImplemented}
                agentRunning={$agentRunState.running}
                onselectpanel={(p) => ctrl.selectedPanel = p}
                oncreatebranchanddiff={() => asImpl(ctrl).loadDiff()}
                onmarkimplemented={() => asImpl(ctrl).markImplemented()}
                onloaddiff={() => asImpl(ctrl).loadDiff()}
            />
        {:else if ctrl.selectedPanel === "commit" && ctrl instanceof ImplController}
            <CommitPanel
                diffContent={ctrl.diffContent}
                diffLoading={ctrl.diffLoading}
                commitMsg={ctrl.commitMsg}
                committing={ctrl.committing}
                reverting={ctrl.reverting}
                revertConfirm={ctrl.revertConfirm}
                oncommitmsgchange={(msg) => asImpl(ctrl).commitMsg = msg}
                oncommit={() => asImpl(ctrl).commitChanges()}
                onrevert={() => asImpl(ctrl).revertChanges()}
                onreloaddiff={() => asImpl(ctrl).loadDiff()}
            />
        {:else if ctrl.selectedPanel === "push" && ctrl instanceof ImplController}
            <PushMergePanel
                {task}
                commitsAhead={ctrl.commitsAhead}
                pushing={ctrl.pushing}
                merging={ctrl.merging}
                linkedIssueState={ctrl.linkedIssueState}
                closingIssue={ctrl.closingIssue}
                closingIssues={false}
                issueRows={[]}
                spinnerFrame={FRAMES[frame]}
                onpush={() => asImpl(ctrl).pushBranch()}
                onmerge={() => asImpl(ctrl).mergeBranch()}
                oncloseissue={() => asImpl(ctrl).closeLinkedIssue()}
                oncloseissues={() => {}}
            />
        {/if}

    {/if}

</div>

<style>
/* ── Détail inline ── */
.inline-detail {
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
}

/* ── Task mergée ── */
.merged-panel {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid #0a160c;
    background: #05100a;
}
.merged-badge {
    font-size: 0.58rem;
    font-family: 'JetBrains Mono', monospace;
    color: #4caf50;
    flex-shrink: 0;
}
.merged-branch {
    font-size: 0.55rem;
    font-family: 'JetBrains Mono', monospace;
    color: #2a5a3a;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.merged-issue {
    font-size: 0.55rem;
    font-family: 'JetBrains Mono', monospace;
    color: #2a4a2a;
    flex-shrink: 0;
}
.merged-delete {
    background: none;
    border: 1px solid #1a2a1a;
    color: #2a4a2a;
    font-size: 0.55rem;
    font-family: 'JetBrains Mono', monospace;
    padding: 0.15rem 0.45rem;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.1s, border-color 0.1s;
}
.merged-delete:hover { color: #f44336; border-color: #f44336; }

/* ── Task bloquée ── */
.stuck-bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 1rem;
    border-bottom: 1px solid #2a1a1a;
    background: #110808;
}
.stuck-label {
    font-size: 0.6rem;
    color: #7a3a2a;
    font-style: italic;
    flex: 1;
}
.stuck-reset {
    background: none;
    border: 1px solid #3a2020;
    color: #a05040;
    font-size: 0.6rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    white-space: nowrap;
    flex-shrink: 0;
}
.stuck-reset:hover:not(:disabled) { color: #f44336; border-color: #f44336; }
.stuck-reset:disabled { opacity: 0.4; cursor: default; }

/* ── Erreur workflow ── */
.wf-error {
    padding: 0.3rem 1rem;
    font-size: 0.62rem;
    color: #f44336;
    font-style: italic;
    border-bottom: 1px solid #1a1a1a;
}

/* ── Input central ── */
.central-input-bar {
    display: flex;
    align-items: center;
    border-top: 1px solid var(--border);
    padding: 0.3rem 0.5rem;
    gap: 0.4rem;
}
.central-input {
    flex: 1;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    padding: 0.25rem 0.5rem;
    outline: none;
}
.central-input:focus { border-color: #9181f9; }
.central-input-send {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: #aaa;
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0.2rem 0.5rem;
}
.central-input-send:hover:not(:disabled) { color: #9181f9; border-color: #9181f9; }
.central-input-send:disabled { opacity: 0.4; cursor: default; }
</style>
