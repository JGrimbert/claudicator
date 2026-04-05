<script lang="ts">
    import { clusterFocusedSymbol } from "$lib/stores/agent";
    import IssueChip from "$lib/components/IssueChip.svelte";
    import type { IssueSlot, HistoryStats, HistCoalNode } from "$lib/components/PlanPanel.helpers";

    let {
        issueSlots,
        histStats,
        histConcepts,
        histUpToDate,
        historyLoaded,
        gitRunning,
        gitProgress,
        onrunGitHistory,
    }: {
        issueSlots:      IssueSlot[];
        histStats:       HistoryStats | null;
        histConcepts:    HistCoalNode[];
        histUpToDate:    boolean;
        historyLoaded:   boolean;
        gitRunning:      boolean;
        gitProgress:     string;
        onrunGitHistory: () => void;
    } = $props();

    let histExpanded = $state(new Set<number>());

    function toggleHist(i: number) {
        const next = new Set(histExpanded);
        if (next.has(i)) next.delete(i); else next.add(i);
        histExpanded = next;
    }
</script>

<!-- ── Header bouton + progress ── -->
<div class="hist-toolbar">
    <button
        class="hist-run-btn"
        class:hist-run-btn--running={gitRunning}
        onclick={onrunGitHistory}
        disabled={gitRunning}
    >{gitRunning ? "analyse…" : "↯ analyser git"}</button>
    {#if gitProgress}
        <span class="hist-progress">{gitProgress}</span>
    {:else if historyLoaded}
        <span class="hist-progress">{histUpToDate ? "à jour" : issueSlots.length > 0 ? "périmé" : "non analysé"}</span>
    {/if}
</div>

<!-- ── Rapport ── -->
{#if histStats && histStats.totalCommits > 0}
    <div class="section-label section-label--hist">RAPPORT</div>
    <div class="hist-report">
        <div class="hist-stat"><span class="hist-stat-label">commits</span><span class="hist-stat-val">{histStats.totalCommits}</span></div>
        <div class="hist-stat"><span class="hist-stat-label">avec sym</span><span class="hist-stat-val">{histStats.commitsWithSymbols}</span></div>
        <div class="hist-stat"><span class="hist-stat-label">symboles</span><span class="hist-stat-val">{histStats.uniqueSymbols}</span></div>
        <div class="hist-stat"><span class="hist-stat-label">issues</span><span class="hist-stat-val">{histStats.uniqueIssues}</span></div>
        <div class="hist-stat"><span class="hist-stat-label">paires</span><span class="hist-stat-val">{histStats.symbolPairs}</span></div>
        <div class="hist-stat"><span class="hist-stat-label">concepts</span><span class="hist-stat-val">{histStats.conceptCount}</span></div>
    </div>
{/if}

<!-- ── Concepts historiques ── -->
{#if histConcepts.length > 0}
    <div class="section-label section-label--hist">CONCEPTS ({histConcepts.length})</div>
    {#each histConcepts as node, i}
        {@const open = histExpanded.has(i)}
        <div class="dir-row hist-row">
            <button class="dir-head" onclick={() => toggleHist(i)}>
                <span class="dir-toggle">{open ? "▾" : "▸"}</span>
                <span class="coal-preview">
                    {#each node.symbols.slice(0, 4) as s, si}
                        <span class="hist-sym-tag">{s.split(".").at(-1)}</span>{#if si < Math.min(node.symbols.length, 4) - 1}<span class="coal-dot"> · </span>{/if}
                    {/each}
                    {#if node.symbols.length > 4}<span class="coal-more">+{node.symbols.length - 4}</span>{/if}
                </span>
                <span class="hist-score">{node.count}×</span>
            </button>
            {#if open}
                <div class="dir-symbols">
                    {#each node.symbols as sym}
                        <div class="sym-line">
                            <button
                                class="sym-name"
                                class:sym-active={$clusterFocusedSymbol?.name === sym}
                                onclick={() => clusterFocusedSymbol.set({ name: sym, dir: "" })}
                            >{sym.split(".").at(-1)}</button>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/each}
{/if}

<!-- ── Liste des issues ── -->
{#if issueSlots.length > 0}
    <div class="section-label section-label--hist">ISSUES</div>
    {#each issueSlots as slot}
        <div class="hist-slot">
            <IssueChip number={slot.issueNumber} />
            <span class="hist-slot-meta">{slot.commitCount} commit{slot.commitCount > 1 ? "s" : ""}</span>
            {#if slot.symbols.length > 0}
                <span class="hist-slot-sym">{slot.symbols.length} sym</span>
            {/if}
        </div>
    {/each}
{:else if historyLoaded && (!histStats || histStats.totalCommits === 0)}
    <p class="hint">Aucune issue référencée dans les commits.<br>Lancez l'analyse pour indexer l'historique.</p>
{/if}

<style>
.section-label {
    padding: 0.5rem 0.6rem 0.2rem;
    font-size: 0.5rem;
    letter-spacing: 0.12em;
    font-family: 'JetBrains Mono', monospace;
    text-transform: uppercase;
    border-top: 1px solid #111;
    margin-top: 0.25rem;
}
.section-label:first-child { border-top: none; margin-top: 0; }
.section-label--hist { color: #7a4a7a; display: flex; align-items: center; gap: 0.5rem; }
/* ── History tab ── */
.hist-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #111;
    flex-shrink: 0;
}
.hist-run-btn {
    background: none;
    border: 1px solid #7a4a7a;
    border-radius: 3px;
    color: #b070b0;
    font-size: 0.58rem;
    font-family: 'JetBrains Mono', monospace;
    padding: 0.2rem 0.55rem;
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
}
.hist-run-btn:hover:not(:disabled) { color: cornsilk; border-color: cornsilk; }
.hist-run-btn:disabled { opacity: 0.5; cursor: default; }
.hist-run-btn--running { animation: blink-git 0.8s step-start infinite; }
.hist-progress {
    font-size: 0.55rem;
    font-family: 'JetBrains Mono', monospace;
    color: #7a4a7a;
}
.hist-slot {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.22rem 0.75rem;
    border-bottom: 1px solid #111;
}
.hist-slot-meta {
    font-size: 0.52rem;
    font-family: 'JetBrains Mono', monospace;
    color: #7a4a7a;
}
.hist-slot-sym {
    font-size: 0.5rem;
    font-family: 'JetBrains Mono', monospace;
    color: #444;
    margin-left: auto;
}
.hist-report {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    padding: 0.35rem 0.75rem 0.5rem;
}
.hist-stat {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0.12rem 0.5rem 0.12rem 0;
    gap: 0.5rem;
}
.hist-stat-label {
    font-size: 0.5rem;
    font-family: 'JetBrains Mono', monospace;
    color: #5a3a5a;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}
.hist-stat-val {
    font-size: 0.65rem;
    font-family: 'JetBrains Mono', monospace;
    color: #c090c0;
}
@keyframes blink-git { 50% { opacity: 0.3; } }
/* ── Dir/symbol rows (utilisés dans les concepts) ── */
.dir-row {
    border-bottom: 1px solid #111;
    padding: 0.1rem 0;
}
.dir-head {
    all: unset;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.6rem;
    cursor: pointer;
    width: 100%;
    box-sizing: border-box;
    transition: background 0.1s;
}
.dir-toggle { font-size: 0.55rem; opacity: 0.5; flex-shrink: 0; width: 10px; }
.coal-preview {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0;
    overflow: hidden;
}
.hist-sym-tag { font-size: 0.58rem; font-family: 'JetBrains Mono', monospace; color: #c090c0; }
.coal-dot    { font-size: 0.5rem; color: #3a7f8f; opacity: 0.5; }
.coal-more   { font-size: 0.5rem; font-family: 'JetBrains Mono', monospace; color: #3a7f8f; margin-left: 0.2rem; }
.hist-score  { font-size: 0.52rem; font-family: 'JetBrains Mono', monospace; color: #7a4a7a; flex-shrink: 0; margin-right: 0.3rem; }
.hist-row .dir-head:hover { background: #100a14; }
.hist-row .dir-toggle { color: #7a4a7a; }
.dir-symbols { padding: 0.15rem 0.6rem 0.4rem 1.5rem; border-top: 1px solid #0d0d0d; }
.sym-line { display: flex; align-items: baseline; gap: 0.4rem; padding: 0.12rem 0; }
.sym-name {
    all: unset;
    font-size: 0.58rem;
    font-family: 'JetBrains Mono', monospace;
    color: #b070b0;
    flex-shrink: 0;
    min-width: 7rem;
    cursor: pointer;
    transition: color 0.1s;
}
.sym-name:hover, .sym-name.sym-active { color: cornsilk; }
.hint {
    padding: 1rem 0.75rem;
    color: #333;
    font-size: 0.65rem;
    font-style: italic;
    font-family: 'JetBrains Mono', monospace;
}
</style>
