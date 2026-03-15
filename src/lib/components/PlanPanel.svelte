<script lang="ts">
    import { planGroups, activePlanGroupIndex } from "$lib/stores/agent";

    type Cluster = { symbol: string; file: string; issues: number[]; count: number };

    let activeTab: "clusters" | "étape" | "étapes" = "clusters";
    let clusters: Cluster[] = [];
    let clustersLoading = false;
    let clustersLoaded = false;

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
            if (res.ok) clusters = await res.json();
        } catch { /* silencieux */ }
        finally {
            clustersLoading = false;
            clustersLoaded = true;
        }
    }

    $: if (activeTab === "clusters" && !clustersLoaded) loadClusters();

    function shortFile(path: string): string {
        const parts = path.replace(/\\/g, "/").split("/");
        return parts.slice(-2).join("/");
    }
</script>

<div class="panel">
    <div class="panel-tabs">
        <button class="tab" class:tab-active={activeTab === "clusters"} onclick={() => activeTab = "clusters"}>clusters</button>
        <button class="tab" class:tab-active={activeTab === "étape"}    onclick={() => activeTab = "étape"}>étape</button>
        <button class="tab" class:tab-active={activeTab === "étapes"}   onclick={() => activeTab = "étapes"}>étapes</button>
        {#if activeTab === "clusters" && clustersLoaded}
            <button class="tab-refresh" onclick={() => { clustersLoaded = false; loadClusters(); }} title="Recalculer">↻</button>
        {/if}
    </div>

    <div class="content">
        {#if activeTab === "clusters"}
            {#if clustersLoading}
                <p class="hint">Calcul en cours…</p>
            {:else if clusters.length === 0}
                <p class="hint">{clustersLoaded ? "Aucun cluster détecté" : "Chargement…"}</p>
            {:else}
                {#each clusters as c}
                    <div class="cluster-row">
                        <div class="cluster-head">
                            <span class="cluster-sym">{c.symbol}</span>
                            <span class="cluster-count">{c.count}</span>
                        </div>
                        <div class="cluster-file">{shortFile(c.file)}</div>
                        <div class="cluster-issues">
                            {#each c.issues as num}
                                <span class="issue-chip">#{num}</span>
                            {/each}
                        </div>
                    </div>
                {/each}
            {/if}

        {:else if activeTab === "étape"}
            {#if activeGroup}
                <div class="group-header">{activeGroup.name}</div>
                <div class="group-issues">
                    {#each activeGroup.issues as num}
                        <div class="issue-chip">#{num}</div>
                    {/each}
                </div>
            {:else if $planGroups.length === 0}
                <p class="hint">Aucune roadmap disponible</p>
            {:else}
                <p class="hint">Sélectionner une étape</p>
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
/* ── Clusters ── */
.cluster-row {
    padding: 0.45rem 0.75rem;
    border-bottom: 1px solid #111;
}
.cluster-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
}
.cluster-sym {
    font-size: 0.63rem;
    font-family: 'JetBrains Mono', monospace;
    color: #8a9aaa;
    word-break: break-all;
    flex: 1;
}
.cluster-count {
    font-size: 0.55rem;
    font-family: 'JetBrains Mono', monospace;
    color: #444;
    flex-shrink: 0;
    background: #111;
    border-radius: 3px;
    padding: 0 0.3rem;
}
.cluster-file {
    font-size: 0.55rem;
    font-family: 'JetBrains Mono', monospace;
    color: #3a3a3a;
    margin-top: 0.1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.cluster-issues {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.3rem;
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
.issue-chip {
    font-size: 0.6rem;
    font-family: 'JetBrains Mono', monospace;
    color: #5a7a9a;
    background: #0d1e2e;
    border: 1px solid #1a3a5a;
    border-radius: 3px;
    padding: 0.1rem 0.4rem;
}
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
