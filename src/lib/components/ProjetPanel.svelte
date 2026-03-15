<script lang="ts">
    import IssueList from "./IssueList.svelte";
    import TodoList from "./TodoList.svelte";
    import TaskList from "./TaskList.svelte";
    import CtaButton from "./CtaButton.svelte";
    import { agentState, projetPanelTab } from "$lib/stores/agent";

    function openCreate() {
        agentState.update(s => ({ ...s, issue: null, plan: null, status: "idle", navigationStack: [] }));
    }
</script>

<div class="panel">
    <div class="panel-tabs">
        <button class="tab" class:tab-active={$projetPanelTab === "todos"} onclick={() => projetPanelTab.set("todos")}>todo</button>
        <button class="tab" class:tab-active={$projetPanelTab === "issues"} onclick={() => projetPanelTab.set("issues")}>issues</button>
        <button class="tab" class:tab-active={$projetPanelTab === "tasks"} onclick={() => projetPanelTab.set("tasks")}>tasks</button>
        {#if $projetPanelTab === "issues"}
            <div class="tab-cta">
                <CtaButton label="Nouvelle issue" useCase="create-issue" onclick={openCreate} />
            </div>
        {/if}
    </div>
    {#if $projetPanelTab === "todos"}
        <TodoList hideHeader={true} />
    {:else if $projetPanelTab === "issues"}
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
.tab-cta {
    margin-left: auto;
    display: flex;
    align-items: center;
    padding-right: 0.4rem;
}
</style>
