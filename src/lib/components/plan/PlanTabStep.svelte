<script lang="ts">
    import { clusterFocusedSymbol, planGroups } from "$lib/stores/agent";
    import IssueChip from "$lib/components/IssueChip.svelte";
    import type { DirCluster, MixedCluster, CoalNode, PlanGroupBase } from "$lib/components/PlanPanel.helpers";
    import type { PlanGroupWithInvalidations } from "$lib/stores/agent";

    type ActiveGroup = PlanGroupWithInvalidations & {
        displayIssues: number[];
        hiddenIssues: { n: number; firstStep: number }[];
        summary?: string;
        dependsOn: string[];
    };

    let {
        activeGroup,
        clustersLoading,
        clustersLoaded,
        issueTaskStatus,
        stepSymbols,
        stepCoal,
        stepDirs,
        stepMixed,
        reprocessingGroup,
        reprocessFeedback,
        onreprocess,
    }: {
        activeGroup:        ActiveGroup | null;
        clustersLoading:    boolean;
        clustersLoaded:     boolean;
        issueTaskStatus:    Map<number, string>;
        stepSymbols:        { name: string; dir: string }[];
        stepCoal:           CoalNode[];
        stepDirs:           DirCluster[];
        stepMixed:          MixedCluster[];
        reprocessingGroup:  number | null;
        reprocessFeedback:  Record<number, string>;
        onreprocess:        (group: PlanGroupWithInvalidations, forceAll?: boolean) => void;
    } = $props();
</script>

{#if activeGroup}
    <div class="group-header">
        <span class="step-index">{activeGroup.index}</span>
        <span class="group-title">{activeGroup.name}</span>
    </div>
    {#if activeGroup.summary}
        <div class="step-summary">{activeGroup.summary}</div>
    {/if}
    {#if activeGroup.dependsOn.length > 0}
        <div class="step-dep">après {activeGroup.dependsOn.join(", ")}</div>
    {/if}
    {@const allDone = activeGroup.issues.length > 0 && activeGroup.issues.every(n => issueTaskStatus.get(n) === "merged" || activeGroup.invalidatedIssues.includes(n))}
    {#if allDone || activeGroup.invalidatedIssues.length > 0}
        <div class="invalid-banner" class:all-done-banner={allDone}>
            <span class="invalid-icon">{allDone ? "✓" : "⚠"}</span>
            {#if allDone}
                Toutes les issues sont terminées — étape à supprimer
            {:else}
                {activeGroup.invalidatedIssues.length} issue{activeGroup.invalidatedIssues.length > 1 ? "s" : ""} fermée{activeGroup.invalidatedIssues.length > 1 ? "s" : ""}
            {/if}
            <button
                class="btn-reprocess" class:btn-remove-step={allDone}
                onclick={() => onreprocess(activeGroup!, allDone)}
                disabled={reprocessingGroup === activeGroup.index}
            >{reprocessFeedback[activeGroup.index] || (reprocessingGroup === activeGroup.index ? "…" : allDone ? "Supprimer l'étape" : "Reprocesser")}</button>
        </div>
    {/if}
    <div class="group-issues">
        {#each activeGroup.displayIssues as num}
            <IssueChip number={num} strikethrough={activeGroup.invalidatedIssues.includes(num)} />
        {/each}
        {#each activeGroup.hiddenIssues as h}
            <span class="group-issue-hidden" title="#{h.n} · déjà au step {h.firstStep}">#{h.n}</span>
        {/each}
    </div>

    {#if clustersLoading}
        <p class="hint">Calcul…</p>
    {:else if clustersLoaded}
        <div class="step-arbo">

            {#if stepSymbols.length > 0}
                <div class="sa-sec sa-sec--sym">
                    <div class="sa-hd">
                        <span class="sa-label">Symboles</span>
                        <span class="sa-count">{stepSymbols.length}</span>
                    </div>
                    {#each stepSymbols as s}
                        <div class="sa-row">
                            <span class="sa-bullet">*</span>
                            <button
                                class="sa-key"
                                class:sa-key--active={$clusterFocusedSymbol?.name === s.name}
                                onclick={() => clusterFocusedSymbol.set({ name: s.name, dir: s.dir })}
                            >{s.name.split('.').at(-1)}</button>
                        </div>
                    {/each}
                </div>
            {/if}

            {#if stepCoal.length > 0}
                <div class="sa-sec sa-sec--coal">
                    <div class="sa-hd">
                        <span class="sa-label">Coalescence</span>
                        <span class="sa-count">{stepCoal.length}</span>
                    </div>
                    {#each stepCoal as node}
                        <div class="sa-row">
                            <span class="sa-bullet">*</span>
                            <span class="sa-key">{[...new Set(node.symbols.map(s => s.dir))].join(' / ') || node.symbols[0]?.key}</span>
                        </div>
                    {/each}
                </div>
            {/if}

            {#if stepDirs.length > 0}
                <div class="sa-sec sa-sec--dir">
                    <div class="sa-hd">
                        <span class="sa-label">Dir</span>
                        <span class="sa-count">{stepDirs.length}</span>
                    </div>
                    {#each stepDirs as c}
                        <div class="sa-row">
                            <span class="sa-bullet">*</span>
                            <span class="sa-key">{c.dir}</span>
                        </div>
                    {/each}
                </div>
            {/if}

            {#if stepMixed.length > 0}
                <div class="sa-sec sa-sec--mixte">
                    <div class="sa-hd">
                        <span class="sa-label">Mixte</span>
                        <span class="sa-count">{stepMixed.length}</span>
                    </div>
                    {#each stepMixed as mx}
                        <div class="sa-row">
                            <span class="sa-bullet">*</span>
                            <span class="sa-key">{mx.dirs.join(' + ')}</span>
                        </div>
                    {/each}
                </div>
            {/if}

        </div>
    {/if}
{:else if $planGroups.length === 0}
    <p class="hint">Aucune roadmap disponible</p>
{:else}
    <p class="hint">Sélectionner une étape</p>
{/if}

<style>
.group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.75rem 0.3rem;
    border-bottom: 1px solid #111;
    font-family: 'JetBrains Mono', monospace;
}
.group-title {
    font-size: 0.65rem;
    color: #888;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.group-issues {
    padding: 0.25rem 0.75rem 0.3rem 1.65rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
}
.group-issue-hidden {
    font-size: 0.58rem;
    color: #444;
    font-family: 'JetBrains Mono', monospace;
    border: 1px solid #222;
    border-radius: 3px;
    padding: 0.04rem 0.32rem;
    opacity: 0.45;
    cursor: default;
}
.invalid-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.58rem;
    color: #c87a20;
    background: #120a00;
    border: 1px solid #3a1e00;
    border-radius: 3px;
    padding: 0.3rem 0.5rem;
    margin-bottom: 0.35rem;
}
.invalid-icon { font-size: 0.7rem; }
.btn-reprocess {
    font-size: 0.55rem;
    color: #c87a20;
    background: none;
    border: 1px solid #4a2a00;
    border-radius: 3px;
    padding: 0.1rem 0.4rem;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.12s, border-color 0.12s;
}
.btn-reprocess:hover:not(:disabled) { color: cornsilk; border-color: #8a5a00; }
.btn-reprocess:disabled { opacity: 0.4; cursor: default; }
.btn-remove-step { color: #b07ee0; border-color: #3a1a6a; }
.btn-remove-step:hover:not(:disabled) { color: #d4aaff; border-color: #7a4aaa; }
.all-done-banner { background: #0e0818; border-color: #3a1a6a; }
.all-done-banner .invalid-icon { color: #b07ee0; }
/* ── Étape arbo ── */
.step-arbo { padding: 0.25rem 0.75rem 1rem; }
.sa-sec { margin-bottom: 0.15rem; }
.sa-hd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0 0.06rem;
}
.sa-label {
    font-size: 0.52rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-family: 'JetBrains Mono', monospace;
}
.sa-count {
    font-size: 0.52rem;
    font-family: 'JetBrains Mono', monospace;
}
.sa-row {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    padding: 0.07rem 0;
    font-family: 'JetBrains Mono', monospace;
    min-width: 0;
}
.sa-bullet { font-size: 0.52rem; flex-shrink: 0; }
.sa-key {
    all: unset;
    font-size: 0.58rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    transition: color 0.1s;
}
.sa-sec--sym   .sa-label, .sa-sec--sym   .sa-count  { color: #6655aa; }
.sa-sec--sym   .sa-bullet                            { color: #6655aa; opacity: 0.45; }
.sa-sec--sym   .sa-key                               { color: #a090e0; }
.sa-sec--sym   .sa-key:hover, .sa-sec--sym :global(.sa-key--active) { color: cornsilk; }
.sa-sec--coal  .sa-label, .sa-sec--coal  .sa-count  { color: #3a7f8f; }
.sa-sec--coal  .sa-bullet                            { color: #3a7f8f; opacity: 0.45; }
.sa-sec--coal  .sa-key                               { color: #68c0cc; }
.sa-sec--dir   .sa-label, .sa-sec--dir   .sa-count  { color: #3a7a48; }
.sa-sec--dir   .sa-bullet                            { color: #3a7a48; opacity: 0.45; }
.sa-sec--dir   .sa-key                               { color: #7abf82; }
.sa-sec--mixte .sa-label, .sa-sec--mixte .sa-count  { color: #7a5e1e; }
.sa-sec--mixte .sa-bullet                            { color: #7a5e1e; opacity: 0.45; }
.sa-sec--mixte .sa-key                               { color: #c8a454; }
.step-index {
    font-size: 0.6rem;
    color: #444;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
    width: 14px;
}
.step-summary {
    font-size: 0.6rem;
    color: #555;
    font-family: 'JetBrains Mono', monospace;
    font-style: italic;
    padding: 0 0.75rem 0.2rem 1.65rem;
    line-height: 1.45;
}
.step-dep {
    font-size: 0.54rem;
    color: #3a3a5a;
    font-family: 'JetBrains Mono', monospace;
    padding: 0 0.75rem 0.2rem 1.65rem;
}
.hint {
    padding: 1rem 0.75rem;
    color: #333;
    font-size: 0.65rem;
    font-style: italic;
    font-family: 'JetBrains Mono', monospace;
}
</style>
