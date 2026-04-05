<script lang="ts">
    import type { SymbolEntry } from "$lib/types/symbols";

    export let initialQuery: string = "";
    export let extraContext: string = "";

    type SearchResult = SymbolEntry & {
        endLine: number | null;
        codeSnippet: string | null;
        snippetError: string | null;
    };

    let results: SearchResult[] = [];
    let loading = false;
    let error = "";
    let searched = false;
    let lastAutoQuery = "";
    let expanded = new Set<string>();

    // Auto-trigger quand initialQuery change
    $: if (initialQuery && initialQuery !== lastAutoQuery) {
        lastAutoQuery = initialQuery;
        doSearch(initialQuery);
    }

    async function doSearch(q: string) {
        if (!q.trim()) return;
        const enriched = extraContext ? q + '\n' + extraContext.slice(0, 300) : q;
        loading = true;
        error = "";
        results = [];
        searched = false;
        expanded = new Set();
        try {
            const res = await fetch("/api/cartography", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: enriched })
            });
            const data = await res.json();
            if (data.error) { error = data.error; return; }
            results = data.grepMethods?.length > 0 ? data.grepMethods : (data.results ?? []);
            searched = true;
        } catch (e: any) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    function toggle(key: string) {
        if (expanded.has(key)) expanded.delete(key);
        else expanded.add(key);
        expanded = expanded;
    }

    function estimateTokens(r: SearchResult): number {
        return Math.round((r.codeSnippet?.length ?? 0) / 4);
    }

    $: totalTokens = results.reduce((sum, r) => sum + estimateTokens(r), 0);
</script>

<div class="sv">
    <div class="sv-content">
        {#if loading}
            <div class="sv-state">Recherche…</div>
        {:else if error}
            <div class="sv-state err">{error}</div>
        {:else if !searched && !initialQuery}
            <div class="sv-state muted">Sélectionner une tâche ou une issue pour voir les symboles</div>
        {:else if searched && results.length === 0}
            <div class="sv-state muted">Aucun résultat</div>
        {:else}
            <div class="sv-ctx-header">
                <span class="sv-total-tok">Σ contexte ≈ {totalTokens.toLocaleString("fr-FR")} tok</span>
            </div>
            {#each results as r}
                <div class="sv-item">
                    <div class="sv-head" role="button" onclick={() => toggle(r.key)}>
                        <div class="sv-meta">
                            <span class="sv-key">{r.key}</span>
                            {#if r.role}<span class="sv-role">{r.role}</span>{/if}
                            {#if estimateTokens(r) > 0}<span class="sv-tok">~{estimateTokens(r)} tok</span>{/if}
                            <span class="sv-score" style="margin-left:auto">{r.score?.toFixed ? r.score.toFixed(3) : r.score}</span>
                        </div>
                        {#if r.summary}<div class="sv-summary">{r.summary}</div>{/if}
                        <div class="sv-file">{r.file}{r.startLine ? `:${r.startLine}` : ""}</div>
                    </div>
                    {#if expanded.has(r.key)}
                        {#if r.codeSnippet}
                            <pre class="sv-code">{r.codeSnippet}</pre>
                        {:else if r.snippetError}
                            <div class="sv-missing">{r.snippetError}</div>
                        {/if}
                    {/if}
                </div>
            {/each}
        {/if}
    </div>
</div>

<style>
.sv {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}
.sv-content {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
}
.sv-content::-webkit-scrollbar { width: 4px; }
.sv-content::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 2px; }
.sv-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    font-style: italic;
    color: #555;
}
.sv-state.err { color: #7a3a2a; font-style: normal; }
.sv-state.muted { color: #1e1e2a; }
.sv-item {
    border-bottom: 1px solid var(--border);
}
.sv-item:last-child { border-bottom: none; }
.sv-head {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.4rem 0.75rem;
    cursor: pointer;
    user-select: none;
}
.sv-head:hover { background: var(--bg-panel); }
.sv-meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
}
.sv-key {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    color: #9181f9;
}
.sv-role {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.63rem;
    color: #444;
}
.sv-score {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    color: #333;
    flex-shrink: 0;
}
.sv-summary {
    font-size: 0.72rem;
    color: #666;
    line-height: 1.3;
}
.sv-file {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.63rem;
    color: #444;
}
.sv-code {
    overflow-x: auto;
    padding: 0.5rem 0.75rem;
    background: var(--bg-deep);
    border-top: 1px solid var(--border);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    color: #bbb;
    white-space: pre;
    margin: 0;
    line-height: 1.5;
}
.sv-missing {
    padding: 0.3rem 0.75rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.63rem;
    color: #444;
    border-top: 1px solid var(--border);
}
.sv-ctx-header {
    padding: 0.25rem 0.75rem;
    border-bottom: 1px solid var(--border);
}
.sv-total-tok {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.58rem;
    color: cornsilk;
    opacity: 0.35;
}
.sv-tok {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.58rem;
    color: cornsilk;
    opacity: 0.45;
}
</style>
