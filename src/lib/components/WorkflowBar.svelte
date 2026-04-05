<script lang="ts">
import type { Task, WfPanel } from "$lib/types/task";
import { btnVariant } from "./TaskList.helpers";

interface Props {
    task: Task;
    currentStep: number;
    branchCreating: boolean;
    onselectpanel: (panel: WfPanel) => void;
    oncreatebranchanddiff: () => void;
    onloadcommitsahead: () => void;
}
let { task, currentStep, branchCreating, onselectpanel, oncreatebranchanddiff, onloadcommitsahead }: Props = $props();
</script>

<div class="wf-bar">
    <button
        class="wf-btn"
        class:wf-active={btnVariant(0, currentStep) === "active"}
        class:wf-disabled={btnVariant(0, currentStep) !== "active"}
        disabled={btnVariant(0, currentStep) !== "active"}
        onclick={() => onselectpanel("plan")}
    >Planifier</button>
    <span class="wf-arrow">›</span>
    <button
        class="wf-btn"
        class:wf-active={btnVariant(1, currentStep) === "active"}
        class:wf-disabled={btnVariant(1, currentStep) !== "active"}
        disabled={btnVariant(1, currentStep) !== "active"}
        onclick={() => onselectpanel("implement")}
    >Implémenter</button>
    <span class="wf-arrow">›</span>
    <button
        class="wf-btn"
        class:wf-active={btnVariant(2, currentStep) === "active"}
        class:wf-disabled={btnVariant(2, currentStep) !== "active"}
        disabled={btnVariant(2, currentStep) !== "active" || branchCreating}
        onclick={() => task.branch ? onselectpanel("commit") : oncreatebranchanddiff()}
    >{branchCreating ? "Création…" : "Commiter"}</button>
    <span class="wf-arrow">›</span>
    <button
        class="wf-btn"
        class:wf-active={btnVariant(3, currentStep) === "active"}
        class:wf-secondary={btnVariant(3, currentStep) === "secondary" || (!!task.branch && btnVariant(3, currentStep) === "disabled")}
        class:wf-disabled={!task.branch}
        disabled={!task.branch}
        onclick={() => { onselectpanel("push"); if (task.branch) onloadcommitsahead(); }}
    >Push</button>
    <span class="wf-arrow">›</span>
    <button class="wf-btn wf-disabled" disabled>Merge</button>
</div>

<style>
.wf-bar {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
}
.wf-bar::-webkit-scrollbar { display: none; }
.wf-arrow {
    color: var(--border);
    font-size: 0.85rem;
    flex-shrink: 0;
    padding: 0 0.2rem;
    line-height: 1;
}
/* .wf-btn — défini globalement dans +layout.svelte */
</style>
