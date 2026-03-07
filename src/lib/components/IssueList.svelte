<script lang="ts">
    import { onMount } from "svelte";
    import { agentState, type Issue } from "$lib/stores/agent";

    let issues: Issue[] = [];
    let loading = true;
    let error = "";

    $: filteredIssues = issues.filter(i => !$agentState.knownSubIssueNumbers.includes(i.number));

    onMount(async () => {
        try {
            const res = await fetch("/api/issues");
            if (!res.ok) throw new Error(await res.text());
            issues = await res.json();
        } catch (e: any) {
            error = e.message ?? "Erreur chargement issues";
        } finally {
            loading = false;
        }
    });

    async function select(issue: Issue) {
        agentState.update(s => ({
            ...s,
            issue: { ...issue, body: "", subIssues: [] },
            plan: null,
            status: "loading",
            navigationStack: []
        }));

        const res = await fetch(`/api/issue?number=${issue.number}`);
        const full = await res.json();

        agentState.update(s => ({
            ...s,
            issue: full,
            status: "idle",
            knownSubIssueNumbers: [
                ...new Set([...s.knownSubIssueNumbers, ...(full.subIssues?.map((si: any) => si.number) ?? [])])
            ]
        }));
    }
</script>

<div class="panel">
    <div class="panel-header">Issues</div>
    <div class="list">
        {#if loading}
            <p class="hint">Chargement...</p>
        {:else if error}
            <p class="error">{error}</p>
        {:else if filteredIssues.length === 0}
            <p class="hint">Aucune issue ouverte</p>
        {:else}
            {#each filteredIssues as issue}
                <button
                    class="issue-item"
                    class:active={$agentState.issue?.number === issue.number}
                    onclick={() => select(issue)}
                >
                    <span class="issue-number">#{issue.number}</span>
                    <span class="issue-title">{issue.title}</span>
                </button>
            {/each}
        {/if}
    </div>
</div>

<style>
.panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.panel-header {
    padding: 0.6rem 1rem;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #555;
    border-bottom: 1px solid #1e1e1e;
    flex-shrink: 0;
}
.list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}
.list::-webkit-scrollbar { width: 4px; }
.list::-webkit-scrollbar-track { background: transparent; }
.list::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 2px; }
.list::-webkit-scrollbar-thumb:hover { background: #2a2a2a; }
.issue-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0.6rem 1rem;
    background: none;
    border: none;
    border-bottom: 1px solid #1a1a1a;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
}
.issue-item:hover { background: #1a1a2e; }
.issue-item.active {
    background: #1e1e3a;
    border-left: 2px solid #7c6af7;
}
.issue-number {
    color: #555;
    font-size: 0.7rem;
    font-family: 'JetBrains Mono', monospace;
    margin-bottom: 0.15rem;
}
.issue-title {
    color: #bbb;
    font-size: 0.82rem;
    line-height: 1.3;
}
.hint { padding: 1rem; color: #333; font-size: 0.8rem; }
.error { padding: 1rem; color: #f44336; font-size: 0.8rem; }
</style>
