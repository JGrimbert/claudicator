<script lang="ts">
    import IssueList from "./IssueList.svelte";
    import TodoList from "./TodoList.svelte";

    let activeTab: "issues" | "todos" = "issues";
</script>

<div class="panel">
    <div class="panel-tabs">
        <button class="tab" class:tab-active={activeTab === "issues"} onclick={() => activeTab = "issues"}>issues</button>
        <button class="tab" class:tab-active={activeTab === "todos"} onclick={() => activeTab = "todos"}>todos</button>
    </div>
    {#if activeTab === "issues"}
        <IssueList hideHeader={true} />
    {:else}
        <TodoList hideHeader={true} />
    {/if}
</div>

<style>
.panel {
    display: flex;
    flex-direction: column;
    flex: 1;
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
</style>
