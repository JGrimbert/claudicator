<script lang="ts">
import DiffView from "../viewers/DiffView.svelte";
import type { PatchInfo } from "$lib/types/task";

interface Props {
    selectedPatch: PatchInfo;
    patchContent: string | null;
    patchLoading: boolean;
    patchApplying: boolean;
    onapply: () => void;
    onreject: () => void;
}
let { selectedPatch, patchContent, patchLoading, patchApplying, onapply, onreject }: Props = $props();
</script>

<div class="patch-panel">
    <div class="patch-panel-bar">
        <span class="patch-panel-title">{selectedPatch.issueNumber ? `#${selectedPatch.issueNumber}` : selectedPatch.name}</span>
        <span class="patch-panel-test" class:has-tests={selectedPatch.hasTests}>{selectedPatch.hasTests ? "✓ tests" : "✗ tests"}</span>
        <button class="wf-btn wf-active" onclick={() => onapply()} disabled={patchApplying}>{patchApplying ? "…" : "↓ Appliquer"}</button>
        <button class="wf-btn" onclick={() => onreject()}>✕ Rejeter</button>
    </div>
    <DiffView content={patchContent ?? ""} loading={patchLoading} loadingText="Chargement…" />
</div>

<style>
.patch-panel { display: flex; flex-direction: column; border-top: 1px solid var(--border); }
.patch-panel-bar {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 8px; flex-shrink: 0;
}
.patch-panel-title { font-size: 0.7rem; font-weight: 600; color: var(--text); }
.patch-panel-test { font-size: 0.62rem; color: #f44336; }
.patch-panel-test.has-tests { color: #4caf50; }
/* .wf-btn — défini globalement dans +layout.svelte */
</style>
