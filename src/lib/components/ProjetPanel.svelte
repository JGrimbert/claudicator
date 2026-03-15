<script lang="ts">
    import IssueList from "./IssueList.svelte";
    import TodoList from "./TodoList.svelte";
    import TaskList from "./TaskList.svelte";
    import { agentState } from "$lib/stores/agent";

    let activeTab: "todos" | "issues" | "tasks" = "issues";

    function openCreate() {
        agentState.update(s => ({ ...s, issue: null, plan: null, status: "idle", navigationStack: [] }));
    }
</script>

<div class="panel">
    <div class="panel-tabs">
        <button class="tab" class:tab-active={activeTab === "todos"} onclick={() => activeTab = "todos"}>todo</button>
        <button class="tab" class:tab-active={activeTab === "issues"} onclick={() => activeTab = "issues"}>issues</button>
        <button class="tab" class:tab-active={activeTab === "tasks"} onclick={() => activeTab = "tasks"}>tasks</button>
        {#if activeTab === "issues"}
            <button class="tab-action" onclick={openCreate} title="Nouvelle issue">+</button>
        {/if}
    </div>
    {#if activeTab === "todos"}
        <TodoList hideHeader={true} />
    {:else if activeTab === "issues"}
        <IssueList hideHeader={true} />
    {:else}
        <TaskList />
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
.tab-action {
    background: none;
    border: none;
    border-left: 1px solid var(--border);
    cursor: pointer;
    font-size: 0.85rem;
    color: #333;
    padding: 0 0.55rem;
    height: 100%;
    margin-left: auto;
    transition: color 0.1s;
    font-family: 'JetBrains Mono', monospace;
    line-height: 1;
}
.tab-action:hover { color: var(--accent-hover); }
</style>
