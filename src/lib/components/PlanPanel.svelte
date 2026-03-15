<script lang="ts">
    import { planGroups, activePlanGroupIndex, clusterFocusedSymbol } from "$lib/stores/agent";
    import IssueChip from "$lib/components/IssueChip.svelte";

    type SymbolEntry  = { name: string; issues: number[] };
    type DirCluster   = { dir: string; symbols: SymbolEntry[]; issues: number[]; count: number };
    type MixedSymbol  = { name: string; dir: string; issues: number[] };
    type MixedCluster = { dirs: string[]; symbols: MixedSymbol[]; issues: number[]; count: number };
    type CoalSymbol   = { key: string; dir: string };
    type CoalNode     = { symbols: CoalSymbol[]; issues: number[]; score: number; count: number };
    type HistCoalNode = { symbols: string[]; count: number; score: number };

    let activeTab: "clusters" | "étape" | "étapes" | "history" = "clusters";
    let dirs:  DirCluster[]   = [];
    let mixed: MixedCluster[] = [];
    let coal:  CoalNode[]     = [];
    type IssueSlot = { issueNumber: number; commitCount: number; symbols: string[] };
    type HistoryStats = {
        totalCommits:       number;
        commitsWithSymbols: number;
        uniqueSymbols:      number;
        uniqueIssues:       number;
        symbolPairs:        number;
        conceptCount:       number;
    };

    let histCoal:    HistCoalNode[] = [];
    let histUpToDate = false;
    let clustersLoading = false;
    let clustersLoaded  = false;

    // ── Onglet history ────────────────────────────────────────────────────────
    let issueSlots:    IssueSlot[] = [];
    let histStats:     HistoryStats | null = null;
    let histConcepts:  HistCoalNode[] = [];
    let historyLoaded  = false;

    async function loadHistory() {
        try {
            const res = await fetch("/api/git-history");
            if (!res.ok) return;
            const data = await res.json();
            issueSlots   = data.slots     ?? [];
            histUpToDate = data.isUpToDate ?? false;
            histStats    = data.stats      ?? null;
            histConcepts = data.coal       ?? [];
        } catch {}
        finally { historyLoaded = true; }
    }

    $: if (activeTab === "history" && !historyLoaded) loadHistory();

    // ── Git history run ───────────────────────────────────────────────────────
    let gitRunning  = false;
    let gitProgress = "";

    async function runGitHistory() {
        if (gitRunning) return;
        gitRunning  = true;
        gitProgress = "démarrage…";
        try {
            const res = await fetch("/api/git-history/run", { method: "POST" });
            if (!res.ok || !res.body) { gitProgress = "erreur"; return; }
            const reader = res.body.getReader();
            const dec    = new TextDecoder();
            let buf = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split("\n\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                    const m = line.match(/^data: (.+)$/m);
                    if (!m) continue;
                    const ev = JSON.parse(m[1]);
                    if (ev.type === "progress") gitProgress = `${ev.processed}/${ev.total}`;
                    if (ev.type === "done")     gitProgress = `✓ ${ev.processedCount} commits, ${ev.coalCount} concepts`;
                    if (ev.type === "error")    gitProgress = `✗ ${ev.message}`;
                }
            }
        } catch (e: any) {
            gitProgress = `✗ ${e.message}`;
        } finally {
            gitRunning = false;
            // Rafraîchir history + clusters
            historyLoaded  = false;
            clustersLoaded = false;
            loadHistory();
            loadClusters();
        }
    }

    let coalExpanded = new Set<number>();
    function toggleCoal(i: number) {
        const next = new Set(coalExpanded);
        if (next.has(i)) next.delete(i); else next.add(i);
        coalExpanded = next;
    }

    let histExpanded = new Set<number>();
    function toggleHist(i: number) {
        const next = new Set(histExpanded);
        if (next.has(i)) next.delete(i); else next.add(i);
        histExpanded = next;
    }

    $: activeGroup = $planGroups[$activePlanGroupIndex] ?? null;

    function selectGroup(idx: number) {
        activePlanGroupIndex.set(idx);
        activeTab = "étape";
    }

    async function loadClusters() {
        if (clustersLoading) return;
        clustersLoading = true;
        try {
            const res = await fetch("/api/clusters");
            if (res.ok) {
                const data = await res.json();
                dirs        = data.dirs  ?? [];
                mixed       = data.mixed ?? [];
                coal        = data.coal  ?? [];
                histCoal    = data.historical?.coal      ?? [];
                histUpToDate = data.historical?.isUpToDate ?? false;
            }
        } catch { /* silencieux */ }
        finally {
            clustersLoading = false;
            clustersLoaded  = true;
        }
    }

    $: if ((activeTab === "clusters" || activeTab === "étape") && !clustersLoaded) loadClusters();

    // ─── Dérivations pour l'onglet étape ──────────────────────────────────────
    $: stepIssues = new Set(activeGroup?.issues ?? []);
    $: stepDirs   = dirs.filter(c => c.issues.some(n => stepIssues.has(n)));
    $: stepCoal   = coal.filter(c => c.issues.some(n => stepIssues.has(n)));
    $: stepMixed  = mixed.filter(c => c.issues.some(n => stepIssues.has(n)));
    $: stepSymbols = (() => {
        const seen   = new Set<string>();
        const result: { name: string; dir: string }[] = [];
        for (const c of stepDirs) {
            for (const s of c.symbols) {
                if (s.issues.some(n => stepIssues.has(n)) && !seen.has(s.name)) {
                    seen.add(s.name);
                    result.push({ name: s.name, dir: c.dir });
                }
            }
        }
        for (const c of stepCoal) {
            for (const s of c.symbols) {
                if (!seen.has(s.key)) {
                    seen.add(s.key);
                    result.push({ name: s.key, dir: s.dir });
                }
            }
        }
        return result;
    })();

    let expanded = new Set<string>();
    function toggleExpand(dir: string) {
        const next = new Set(expanded);
        if (next.has(dir)) next.delete(dir); else next.add(dir);
        expanded = next;
    }
</script>

<div class="panel">
    <div class="panel-tabs">
        <button class="tab" class:tab-active={activeTab === "clusters"} onclick={() => activeTab = "clusters"}>clusters</button>
        <button class="tab" class:tab-active={activeTab === "étape"}    onclick={() => activeTab = "étape"}>étape</button>
        <button class="tab" class:tab-active={activeTab === "étapes"}   onclick={() => activeTab = "étapes"}>étapes</button>
        <button class="tab" class:tab-active={activeTab === "history"}  onclick={() => activeTab = "history"}>history</button>
        {#if activeTab === "clusters" && clustersLoaded}
            <button class="tab-refresh" onclick={() => { clustersLoaded = false; loadClusters(); }} title="Recalculer">↻</button>
        {/if}
    </div>

    <div class="content">
        {#if activeTab === "clusters"}
            {#if clustersLoading}
                <p class="hint">Calcul en cours…</p>
            {:else if dirs.length === 0 && mixed.length === 0 && coal.length === 0}
                <p class="hint">{clustersLoaded ? "Aucun cluster détecté" : "Chargement…"}</p>
            {:else}
                <!-- ── Historique git (en tête) ── -->
                {#if histCoal.length > 0}
                    <div class="section-label section-label--hist">
                        HISTORIQUE
                        {#if histUpToDate}<span class="hist-badge hist-badge--ok">à jour</span>{:else}<span class="hist-badge hist-badge--stale">périmé</span>{/if}
                    </div>
                    {#each histCoal as node, i}
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
                            </button>
                            <div class="dir-issues">
                                {#each node.issues as num}
                                    <IssueChip number={num} />
                                {/each}
                            </div>
                            {#if open}
                                <div class="dir-symbols">
                                    {#each node.symbols as sym}
                                        <div class="sym-line">
                                            <button
                                                class="sym-name"
                                                class:sym-active={$clusterFocusedSymbol?.name === sym.key}
                                                onclick={() => clusterFocusedSymbol.set({ name: sym.key, dir: sym.dir })}
                                            >{sym.key.split(".").at(-1)}</button>
                                            <span class="sym-dir-tag">{sym.dir}</span>
                                        </div>
                                    {/each}
                                </div>
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
                        <div class="dir-row">
                            <button class="dir-head" onclick={() => toggleExpand(c.dir)}>
                                <span class="dir-toggle">{open ? "▾" : "▸"}</span>
                                <span class="dir-name">{c.dir}/</span>
                                <span class="dir-count">×{c.count}</span>
                            </button>
                            <div class="dir-issues">
                                {#each c.issues as num}
                                    <IssueChip number={num} />
                                {/each}
                            </div>
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

        {:else if activeTab === "étape"}
            {#if activeGroup}
                <div class="group-header">{activeGroup.name}</div>
                <div class="group-issues">
                    {#each activeGroup.issues as num}
                        <IssueChip number={num} />
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

        {:else if activeTab === "history"}
            <!-- ── Header bouton + progress ── -->
            <div class="hist-toolbar">
                <button
                    class="hist-run-btn"
                    class:hist-run-btn--running={gitRunning}
                    onclick={runGitHistory}
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

        {:else}
            {#if $planGroups.length === 0}
                <p class="hint">Aucune roadmap disponible</p>
            {:else}
                {#each $planGroups as group}
                    <button
                        class="step-row"
                        class:step-active={$activePlanGroupIndex === group.index - 1}
                        onclick={() => selectGroup(group.index - 1)}
                    >
                        <span class="step-index">{group.index}</span>
                        <span class="step-name">{group.name}</span>
                        <span class="step-count">{group.issues.length} issues</span>
                    </button>
                {/each}
            {/if}
        {/if}
    </div>
</div>

<style>
.panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
}
.panel-tabs {
    display: flex;
    align-items: center;
    height: 28px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg-panel);
}
.tab {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #2e2e2e;
    padding: 0 0.55rem;
    height: 100%;
    border-right: 1px solid var(--border);
    transition: color 0.1s;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
}
.tab:hover { color: #555; }
.tab-active { color: #777; }
.tab-refresh {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.75rem;
    color: #333;
    padding: 0 0.45rem;
    height: 100%;
    margin-left: auto;
    border-left: 1px solid var(--border);
    transition: color 0.1s;
    font-family: 'JetBrains Mono', monospace;
}
.tab-refresh:hover { color: #666; }
.content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.5rem 0;
}
.content::-webkit-scrollbar { width: 4px; }
.content::-webkit-scrollbar-track { background: transparent; }
.content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.hint {
    padding: 1rem 0.75rem;
    color: #333;
    font-size: 0.65rem;
    font-style: italic;
    font-family: 'JetBrains Mono', monospace;
}
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
.section-label--coal  { color: #3a7f8f; }
.section-label--mixed { color: #7a5e1e; }
.section-label--hist  { color: #7a4a7a; display: flex; align-items: center; gap: 0.5rem; }
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
.sym-issue-id {
    font-size: 0.54rem;
    font-family: 'JetBrains Mono', monospace;
    color: #2a3a4a;
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
/* ── Étape ── */
.group-header {
    padding: 0.5rem 0.75rem 0.25rem;
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #666;
    font-family: 'JetBrains Mono', monospace;
}
.group-issues {
    padding: 0.25rem 0.75rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
}
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
.hist-row .sym-name         { color: #b070b0; }
.hist-row .sym-name:hover,
.hist-row .sym-name.sym-active { color: cornsilk; }
.git-progress {
    padding: 0.3rem 0.75rem;
    font-size: 0.6rem;
    font-family: 'JetBrains Mono', monospace;
    color: #7a4a7a;
}

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
/* Pastel prisme — mêmes teintes qu'ArtifactViewer */
.sa-sec--sym   .sa-label, .sa-sec--sym   .sa-count  { color: #6655aa; }
.sa-sec--sym   .sa-bullet                            { color: #6655aa; opacity: 0.45; }
.sa-sec--sym   .sa-key                               { color: #a090e0; }
.sa-sec--sym   .sa-key:hover, .sa-sec--sym .sa-key--active { color: cornsilk; }

.sa-sec--coal  .sa-label, .sa-sec--coal  .sa-count  { color: #3a7f8f; }
.sa-sec--coal  .sa-bullet                            { color: #3a7f8f; opacity: 0.45; }
.sa-sec--coal  .sa-key                               { color: #68c0cc; }

.sa-sec--dir   .sa-label, .sa-sec--dir   .sa-count  { color: #3a7a48; }
.sa-sec--dir   .sa-bullet                            { color: #3a7a48; opacity: 0.45; }
.sa-sec--dir   .sa-key                               { color: #7abf82; }

.sa-sec--mixte .sa-label, .sa-sec--mixte .sa-count  { color: #7a5e1e; }
.sa-sec--mixte .sa-bullet                            { color: #7a5e1e; opacity: 0.45; }
.sa-sec--mixte .sa-key                               { color: #c8a454; }

/* ── Étapes ── */
.step-row {
    all: unset;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    cursor: pointer;
    width: 100%;
    box-sizing: border-box;
    border-bottom: 1px solid #111;
    transition: background 0.1s;
}
.step-row:hover { background: #111; }
.step-active { background: #0d1118; }
.step-index {
    font-size: 0.6rem;
    color: #444;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
    width: 14px;
}
.step-name {
    font-size: 0.65rem;
    color: #888;
    font-family: 'JetBrains Mono', monospace;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.step-count {
    font-size: 0.55rem;
    color: #444;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
}
</style>
