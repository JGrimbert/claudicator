<script lang="ts">
    import { onMount } from "svelte";
    import { agentState } from "$lib/stores/agent";

    const statusLabels: Record<string, string> = {
        idle: "en attente",
        loading: "chargement...",
        planning: "planification...",
        done: "terminé",
        error: "erreur"
    };

    let owner = "";
    let repo  = "";

    onMount(async () => {
        const res  = await fetch("/api/repo-info");
        const data = await res.json();
        owner = data.owner;
        repo  = data.repo;
    });
</script>

<header class="topbar">
    <span class="title">
        {#if owner && repo}
            <span class="owner">{owner}</span><span class="sep">/</span><span class="repo">{repo}</span>
        {:else}
            <span class="owner">—</span>
        {/if}
    </span>
    <span class="status" data-status={$agentState.status}>
        {statusLabels[$agentState.status]}
    </span>
</header>

<style>
.topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    height: 40px;
    background: #12121a;
    border-bottom: 1px solid #222;
    flex-shrink: 0;
}
.title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0;
}
.owner { color: #444; }
.sep   { color: #2a2a2a; margin: 0 0.15rem; }
.repo  { color: #666; font-weight: 600; }
.status {
    color: #444;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
}
.status[data-status="planning"] { color: #f7c948; }
.status[data-status="done"] { color: #4caf50; }
.status[data-status="error"] { color: #f44336; }
</style>
