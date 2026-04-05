<script lang="ts">
    import { clusterFocusedSymbol, planGroups } from "$lib/stores/agent";
    import IssueChip from "$lib/components/issues/IssueChip.svelte";
    import { groupIssuesByPlanGroup } from "./PlanPanel.helpers";
    import type { DirCluster, MixedCluster, CoalNode, CoalSymbol, HistCoalNode } from "./PlanPanel.helpers";

    let {
        dirs,
        mixed,
        coal,
        histCoal,
        histUpToDate,
        clustersLoading,
        clustersLoaded,
        matchedHistSymbolSets,
    }: {
        dirs:                 DirCluster[];
        mixed:                MixedCluster[];
        coal:                 CoalNode[];
        histCoal:             HistCoalNode[];
        histUpToDate:         boolean;
        clustersLoading:      boolean;
        clustersLoaded:       boolean;
        matchedHistSymbolSets: Set<string>;
    } = $props();

    let expanded      = $state(new Set<string>());
    let coalExpanded  = $state(new Set<number>());
    let histExpanded  = $state(new Set<number>());

    function toggleExpand(dir: string) {
        const next = new Set(expanded);
        if (next.has(dir)) next.delete(dir); else next.add(dir);
        expanded = next;
    }
    function toggleCoal(i: number) {
        const next = new Set(coalExpanded);
        if (next.has(i)) next.delete(i); else next.add(i);
        coalExpanded = next;
    }
    function toggleHist(i: number) {
        const next = new Set(histExpanded);
        if (next.has(i)) next.delete(i); else next.add(i);
        histExpanded = next;
    }
</script>

{#if clustersLoading}
    <p class="hint">Calcul en cours…</p>
{:else if dirs.length === 0 && mixed.length === 0 && coal.length === 0}
    <p class="hint">{clustersLoaded ? "Aucun cluster détecté" : "Chargement…"}</p>
{:else}
    <!-- ── Historique git (en tête) ── -->
    {#if histCoal.filter(n => !matchedHistSymbolSets.has(n.symbols.slice().sort().join(","))).length > 0}
        <div class="section-label section-label--hist">
            HISTORIQUE
            {#if histUpToDate}<span class="hist-badge hist-badge--ok">à jour</span>{:else}<span class="hist-badge hist-badge--stale">périmé</span>{/if}
        </div>
        {#each histCoal.filter(n => !matchedHistSymbolSets.has(n.symbols.slice().sort().join(","))) as node, i}
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

    <!-- ── Coalescence ── -->
    {#if coal.length > 0}
        <div class="section-label section-label--coal">COALESCENCE</div>
        {#each coal as node, i}
            {@const open = coalExpanded.has(i)}
            {@const slotGroups = groupIssuesByPlanGroup(node.issues, $planGroups)}
            <div class="dir-row coal-row">
                <button class="dir-head" onclick={() => toggleCoal(i)}>
                    <span class="dir-toggle">{open ? "▾" : "▸"}</span>
                    <span class="coal-preview">
                        {#each node.symbols.slice(0, 4) as s, si}
                            <span class="coal-sym-tag">{s.key.split(".").at(-1)}</span>{#if si < Math.min(node.symbols.length, 4) - 1}<span class="coal-dot"> · </span>{/if}
                        {/each}
                        {#if node.symbols.length > 4}<span class="coal-more">+{node.symbols.length - 4}</span>{/if}
                    </span>
                    <span class="coal-score">{node.score}</span>
                    {#if node.histMatch}
                        <span class="hist-score hist-score--inline">{node.histMatch.count}×</span>
                    {/if}
                </button>
                {#if slotGroups.length > 1}
                    <div class="slot-stacks">
                        {#each slotGroups as sg, sgIdx}
                            <div class="slot-stack-box" style="--stack-hue: {(sgIdx * 60) % 360}">
                                <div class="slot-stack-head">
                                    <span class="slot-stack-name">{sg.name}</span>
                                    <span class="slot-stack-count">{sg.issues.length}</span>
                                </div>
                                <div class="slot-issues">
                                    {#each sg.issues as num}
                                        <IssueChip number={num} />
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>
                    {#if node.histMatch}
                        {@const histExtra = (node.histMatch.issues ?? []).filter(n => !node.issues.includes(n))}
                        {#if histExtra.length > 0}
                            <div class="dir-issues">
                                {#if histExtra.length <= 2}
                                    {#each histExtra as num}
                                        <IssueChip number={num} variant="hist" />
                                    {/each}
                                {:else}
                                    <span class="hist-issues-more">+{histExtra.length}</span>
                                {/if}
                            </div>
                        {/if}
                    {/if}
                {:else}
                    <div class="dir-issues">
                        {#each node.issues as num}
                            <IssueChip number={num} />
                        {/each}
                        {#if node.histMatch}
                            {@const histExtra = (node.histMatch.issues ?? []).filter(n => !node.issues.includes(n))}
                            {#if histExtra.length <= 2}
                                {#each histExtra as num}
                                    <IssueChip number={num} variant="hist" />
                                {/each}
                            {:else}
                                <span class="hist-issues-more">+{histExtra.length}</span>
                            {/if}
                        {/if}
                    </div>
                {/if}
                {#if open}
                    {@const dirGroups = [...node.symbols.reduce((m, s) => {
                        const d = s.dir || "—";
                        if (!m.has(d)) m.set(d, [] as CoalSymbol[]);
                        m.get(d)!.push(s);
                        return m;
                    }, new Map<string, CoalSymbol[]>()).entries()]}
                    {#if dirGroups.length > 1}
                        <div class="coal-sub-groups">
                            {#each dirGroups as [dir, syms], dIdx}
                                <div class="coal-sub-box" style="--stack-hue: {(dIdx * 60) % 360}">
                                    <div class="coal-sub-head">
                                        <span class="coal-sub-dir">{dir}/</span>
                                        <span class="coal-sub-count">{syms.length}</span>
                                    </div>
                                    <div class="dir-symbols">
                                        {#each syms as sym}
                                            <div class="sym-line">
                                                <button
                                                    class="sym-name"
                                                    class:sym-name--hist={node.histMatch?.symbols.includes(sym.key)}
                                                    class:sym-active={$clusterFocusedSymbol?.name === sym.key}
                                                    onclick={() => clusterFocusedSymbol.set({ name: sym.key, dir: sym.dir })}
                                                >{sym.key.split(".").at(-1)}</button>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <div class="dir-symbols">
                            {#each node.symbols as sym}
                                <div class="sym-line">
                                    <button
                                        class="sym-name"
                                        class:sym-name--hist={node.histMatch?.symbols.includes(sym.key)}
                                        class:sym-active={$clusterFocusedSymbol?.name === sym.key}
                                        onclick={() => clusterFocusedSymbol.set({ name: sym.key, dir: sym.dir })}
                                    >{sym.key.split(".").at(-1)}</button>
                                    <span class="sym-dir-tag">{sym.dir}</span>
                                </div>
                            {/each}
                        </div>
                    {/if}
                {/if}
            </div>
        {/each}
    {/if}

    <!-- ── Mixed clusters ── -->
    {#if mixed.length > 0}
        <div class="section-label section-label--mixed">PATTERNS MIXTES</div>
        {#each mixed as mx}
            <div class="dir-row mixed-row">
                <div class="dir-head mixed-head">
                    <span class="mixed-dirs">
                        {#each mx.dirs as d, di}
                            <span class="mixed-dir">{d}</span>{#if di < mx.dirs.length - 1}<span class="mixed-sep"> + </span>{/if}
                        {/each}
                    </span>
                    <span class="dir-count">×{mx.count}</span>
                </div>
                <div class="dir-symbols">
                    {#each mx.symbols as sym}
                        <div class="sym-line">
                            <button
                                class="sym-name"
                                class:sym-active={$clusterFocusedSymbol?.name === sym.name}
                                onclick={() => clusterFocusedSymbol.set({ name: sym.name, dir: sym.dir })}
                            >{sym.name.split(".").at(-1)}</button>
                            <span class="sym-dir-tag">{sym.dir}</span>
                            <span class="sym-issues">
                                {#each sym.issues as n}
                                    <IssueChip number={n} />
                                {/each}
                            </span>
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
    {/if}

    <!-- ── Clusters par dossier ── -->
    {#if dirs.length > 0}
        <div class="section-label">PAR DOSSIER</div>
        {#each dirs as c}
            {@const open = expanded.has(c.dir)}
            {@const slotGroupsDir = groupIssuesByPlanGroup(c.issues, $planGroups)}
            <div class="dir-row">
                <button class="dir-head" onclick={() => toggleExpand(c.dir)}>
                    <span class="dir-toggle">{open ? "▾" : "▸"}</span>
                    <span class="dir-name">{c.dir}/</span>
                    <span class="dir-count">×{c.count}</span>
                </button>
                {#if slotGroupsDir.length > 1}
                    <div class="slot-stacks">
                        {#each slotGroupsDir as sg, sgIdx}
                            <div class="slot-stack-box" style="--stack-hue: {(sgIdx * 60) % 360}">
                                <div class="slot-stack-head">
                                    <span class="slot-stack-name">{sg.name}</span>
                                    <span class="slot-stack-count">{sg.issues.length}</span>
                                </div>
                                <div class="slot-issues">
                                    {#each sg.issues as num}
                                        <IssueChip number={num} />
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="dir-issues">
                        {#each c.issues as num}
                            <IssueChip number={num} />
                        {/each}
                    </div>
                {/if}
                {#if open}
                    <div class="dir-symbols">
                        {#each c.symbols as sym}
                            <div class="sym-line">
                                <button
                                    class="sym-name"
                                    class:sym-active={$clusterFocusedSymbol?.name === sym.name}
                                    onclick={() => clusterFocusedSymbol.set({ name: sym.name, dir: c.dir })}
                                >{sym.name.split(".").at(-1)}</button>
                                <span class="sym-issues">
                                    {#each sym.issues as n}
                                        <IssueChip number={n} />
                                    {/each}
                                </span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {/each}
    {/if}
{/if}

<style>
/* ── Section labels ── */
.section-label {
    padding: 0.5rem 0.6rem 0.2rem;
    font-size: 0.5rem;
    letter-spacing: 0.12em;
    color: #3a7a48;
    font-family: 'JetBrains Mono', monospace;
    text-transform: uppercase;
    border-top: 1px solid #111;
    margin-top: 0.25rem;
}
.section-label:first-child { border-top: none; margin-top: 0; }
.section-label--coal    { color: #3a7f8f; }
.section-label--mixed   { color: #7a5e1e; }
.section-label--hist    { color: #7a4a7a; display: flex; align-items: center; gap: 0.5rem; }
/* ── Clusters / arbo ── */
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
.dir-head:hover { background: #0d1118; }
.dir-toggle {
    font-size: 0.55rem;
    color: #3a7a48;
    opacity: 0.5;
    flex-shrink: 0;
    width: 10px;
}
.dir-name {
    font-size: 0.65rem;
    font-family: 'JetBrains Mono', monospace;
    color: #7abf82;
    flex: 1;
    min-width: 0;
}
.dir-count {
    font-size: 0.55rem;
    font-family: 'JetBrains Mono', monospace;
    color: #3a7a48;
    flex-shrink: 0;
}
.dir-issues {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0 0.6rem 0.35rem 1.5rem;
}
.dir-symbols {
    padding: 0.15rem 0.6rem 0.4rem 1.5rem;
    border-top: 1px solid #0d0d0d;
}
.sym-line {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.12rem 0;
}
.sym-name {
    all: unset;
    font-size: 0.58rem;
    font-family: 'JetBrains Mono', monospace;
    color: #5a9a68;
    flex-shrink: 0;
    min-width: 7rem;
    cursor: pointer;
    transition: color 0.1s;
}
.sym-name:hover { color: cornsilk; }
.sym-name.sym-active { color: cornsilk; }
/* coal rows override */
.coal-row .sym-name         { color: #50a0b0; }
.coal-row .sym-name:hover,
.coal-row .sym-name.sym-active { color: cornsilk; }
.coal-row .sym-name.sym-name--hist { color: #c090c0; }
.coal-row .sym-name.sym-name--hist:hover { color: #e0b0e0; }
/* mixed rows override */
.mixed-row .sym-name         { color: #b08840; }
.mixed-row .sym-name:hover,
.mixed-row .sym-name.sym-active { color: cornsilk; }
.sym-dir-tag {
    font-size: 0.5rem;
    font-family: 'JetBrains Mono', monospace;
    color: #3a7a48;
    flex-shrink: 0;
    background: #0a160c;
    border-radius: 2px;
    padding: 0 0.3rem;
}
.coal-row .sym-dir-tag  { color: #3a7f8f; background: #061418; }
.mixed-row .sym-dir-tag { color: #7a5e1e; background: #140e04; }
.sym-issues {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
}
/* ── Coalescence ── */
.coal-row .dir-head { background: transparent; }
.coal-row .dir-head:hover { background: #06141a; }
.coal-row .dir-toggle { color: #3a7f8f; }
.coal-row .dir-count  { color: #3a7f8f; }
.coal-preview {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0;
    overflow: hidden;
}
.coal-sym-tag {
    font-size: 0.58rem;
    font-family: 'JetBrains Mono', monospace;
    color: #68c0cc;
}
.coal-dot {
    font-size: 0.5rem;
    color: #3a7f8f;
    opacity: 0.5;
}
.coal-more {
    font-size: 0.5rem;
    font-family: 'JetBrains Mono', monospace;
    color: #3a7f8f;
    margin-left: 0.2rem;
}
.coal-score {
    font-size: 0.52rem;
    font-family: 'JetBrains Mono', monospace;
    color: #3a7f8f;
    flex-shrink: 0;
    margin-right: 0.3rem;
}
/* ── Coal sous-groupes par dossier ── */
.coal-sub-groups {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.1rem 0;
}
.coal-sub-box {
    border: 1px dashed hsl(calc(var(--stack-hue, 200) * 1deg) 28% 30%);
    border-radius: 3px;
    padding: 0.2rem 0.35rem;
}
.coal-sub-head {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 0.1rem;
}
.coal-sub-dir {
    font-size: 0.56rem;
    color: #3a7f8f;
    background: #061418;
    border-radius: 2px;
    padding: 0 0.25rem;
}
.coal-sub-count {
    font-size: 0.52rem;
    color: #2a5a5a;
}
/* ── Slot stacks ── */
.slot-stacks {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin: 0.1rem 0;
}
.slot-stack-box {
    border: 1px dashed hsl(calc(var(--stack-hue, 0) * 1deg) 28% 30%);
    border-radius: 3px;
    padding: 0.15rem 0.3rem;
}
.slot-stack-head {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 0.08rem;
}
.slot-stack-name {
    font-size: 0.55rem;
    color: #7a6ad9;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
}
.slot-stack-count {
    font-size: 0.5rem;
    color: #555;
    flex-shrink: 0;
}
.slot-issues {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem;
}
/* ── Mixed clusters ── */
.mixed-head {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.6rem;
    width: 100%;
    box-sizing: border-box;
}
.mixed-row .dir-count { color: #7a5e1e; }
.mixed-dirs {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0;
    overflow: hidden;
}
.mixed-dir {
    font-size: 0.6rem;
    font-family: 'JetBrains Mono', monospace;
    color: #c8a454;
}
.mixed-sep {
    font-size: 0.5rem;
    color: #7a5e1e;
    opacity: 0.6;
}
/* ── Hist ── */
.hist-badge {
    font-size: 0.48rem;
    border-radius: 2px;
    padding: 0.05rem 0.3rem;
    font-family: 'JetBrains Mono', monospace;
}
.hist-badge--ok    { color: #3a7a48; background: #0a160c; }
.hist-badge--stale { color: #7a5e1e; background: #140e04; }
.hist-row .dir-head:hover { background: #100a14; }
.hist-row .dir-toggle { color: #7a4a7a; opacity: 0.5; }
.hist-sym-tag {
    font-size: 0.58rem;
    font-family: 'JetBrains Mono', monospace;
    color: #c090c0;
}
.hist-score {
    font-size: 0.52rem;
    font-family: 'JetBrains Mono', monospace;
    color: #7a4a7a;
    flex-shrink: 0;
    margin-right: 0.3rem;
}
.hist-score--inline {
    font-size: 0.6rem;
    color: #c090c0;
    margin-left: 0.3rem;
    opacity: 0.8;
}
.hist-issues-more {
    font-size: 0.55rem;
    font-family: 'JetBrains Mono', monospace;
    color: #c090c0;
    opacity: 0.8;
    padding: 0.1rem 0.3rem;
    border: 1px solid #4a2a5a;
    border-radius: 3px;
    background: #160a1a;
}
.hist-row .sym-name         { color: #b070b0; }
.hist-row .sym-name:hover,
.hist-row .sym-name.sym-active { color: cornsilk; }
.hint {
    padding: 1rem 0.75rem;
    color: #333;
    font-size: 0.65rem;
    font-style: italic;
    font-family: 'JetBrains Mono', monospace;
}
</style>
