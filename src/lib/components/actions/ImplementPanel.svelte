<script lang="ts">
import PromptUsage from "$lib/components/consoles/PromptUsage.svelte";
import { formatDiffSummary } from "../tasks/TaskList.helpers";
import type { Task, WfPanel } from "$lib/types/task";

interface Props {
    task: Task;
    diffContent: string | null;
    diffLoading: boolean;
    branchCreating: boolean;
    justFinished: boolean;
    taskDag: { steps: { id: number }[] } | null;
    markingImplemented: boolean;
    agentRunning: boolean;
    onselectpanel: (panel: WfPanel) => void;
    oncreatebranchanddiff: () => void;
    onmarkimplemented: () => void;
    onloaddiff: () => void;
}
let {
    task, diffContent, diffLoading, branchCreating, justFinished, taskDag,
    markingImplemented, agentRunning,
    onselectpanel, oncreatebranchanddiff, onmarkimplemented, onloaddiff,
}: Props = $props();
</script>

<div class="impl-actions">
    {#if task.branch}
        {#if diffContent !== null}
            {@const diffSummary = formatDiffSummary(diffContent)}
            {#if diffSummary.fileCount > 0}
                <div class="diff-summary">
                    <span class="diff-summary-count">{diffSummary.fileCount} fichier{diffSummary.fileCount > 1 ? "s" : ""} modifié{diffSummary.fileCount > 1 ? "s" : ""}</span>
                    <button class="impl-skip" onclick={() => onselectpanel("commit")}>Voir diff →</button>
                </div>
            {:else}
                <button class="impl-skip" onclick={() => onselectpanel("commit")}>→ Commiter</button>
            {/if}
        {:else}
            <button class="impl-skip" onclick={() => onloaddiff()} disabled={diffLoading}>{diffLoading ? "…" : "↺ Charger diff"}</button>
        {/if}
    {:else if task.hasPlan}
        <button class="impl-skip" onclick={() => oncreatebranchanddiff()} disabled={branchCreating}>{branchCreating ? "Création branche…" : "→ Créer branche + diff"}</button>
    {/if}
    {#if task.implUsage}
        <PromptUsage usage={task.implUsage} totalUsage={task.totalUsage} label="Implémentation" />
    {/if}
    {#if justFinished}
        <div class="post-run-actions">
            <span class="post-run-hint">Run terminé —</span>
            <button class="impl-skip" onclick={() => task.branch ? onselectpanel("commit") : oncreatebranchanddiff()}>→ Commiter</button>
            {#if !task.branch}
                <button class="impl-skip" onclick={() => oncreatebranchanddiff()} disabled={branchCreating}>{branchCreating ? "Création…" : "→ Créer branche"}</button>
            {/if}
        </div>
    {/if}
    {#if task.status === "implementation" && !agentRunning}
        <button class="impl-skip" onclick={() => onmarkimplemented()} disabled={markingImplemented}>{markingImplemented ? "…" : "✓ Marquer implémentée"}</button>
    {/if}
</div>

{#if taskDag}
    <div class="task-dag-mini">
        <div class="task-dag-label">Dépendances (#246)</div>
        <div class="task-dag-nodes">
            {#each taskDag.steps.slice(0, 5) as step}
                <span class="task-dag-node">#{step.id}</span>
            {/each}
            {#if taskDag.steps.length > 5}
                <span class="task-dag-more">+{taskDag.steps.length - 5}</span>
            {/if}
        </div>
    </div>
{/if}

<style>
.impl-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
}
.impl-skip {
    margin-right: auto;
    background: none;
    border: 1px solid #2a3a2a;
    color: #4a7a4a;
    font-size: 0.6rem;
    padding: 0.2rem 0.55rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: color 0.1s, border-color 0.1s;
}
.impl-skip:hover { color: #7cbf7c; border-color: #4a7a4a; }
.impl-skip:disabled { opacity: 0.35; cursor: default; }
.diff-summary {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.2rem 0;
}
.diff-summary-count {
    font-size: 0.65rem;
    color: var(--text-muted);
}
.post-run-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
    flex-wrap: wrap;
}
.post-run-hint {
    font-size: 0.65rem;
    color: #7cbf7c;
}
/* ── DAG mini ── */
.task-dag-mini {
    padding: 0.3rem 1rem;
    border-top: 1px solid var(--border);
}
.task-dag-label { font-size: 0.55rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.2rem; }
.task-dag-nodes { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.task-dag-node {
    font-size: 0.6rem;
    padding: 0.1rem 0.4rem;
    background: rgba(59,130,246,0.08);
    border: 1px solid rgba(59,130,246,0.2);
    border-radius: 2px;
    color: #3b82f6;
}
.task-dag-more { font-size: 0.6rem; color: var(--text-muted); }
</style>
