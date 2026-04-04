<script lang="ts">
import DiffView from "./DiffView.svelte";
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
.wf-btn {
    background: none;
    border: 1px solid transparent;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 0.04em;
    padding: 0.2rem 0.55rem;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: color 0.15s, border-color 0.15s;
    color: #555;
}
.wf-btn:disabled { opacity: 0.4; cursor: default; }
.wf-btn.wf-active {
    color: var(--accent-hover);
    border-color: transparent;
    background: none;
}
.wf-btn.wf-active:hover { color: #b0a0ff; }
</style>
