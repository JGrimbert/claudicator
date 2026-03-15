<script lang="ts">
    import { planGroups, planModeTask, activePlanGroupIndex } from "$lib/stores/agent";

    let activeTab: "task" | "étape" | "étapes" = "task";

    $: activeGroup = $planGroups[$activePlanGroupIndex] ?? null;

    function selectGroup(idx: number) {
        activePlanGroupIndex.set(idx);
        activeTab = "étape";
    }
</script>

<div class="panel">
    <div class="panel-tabs">
        <button class="tab" class:tab-active={activeTab === "task"} onclick={() => activeTab = "task"}>task</button>
        <button class="tab" class:tab-active={activeTab === "étape"} onclick={() => activeTab = "étape"}>étape</button>
        <button class="tab" class:tab-active={activeTab === "étapes"} onclick={() => activeTab = "étapes"}>étapes</button>
    </div>

    <div class="content">
        {#if activeTab === "task"}
            {#if $planModeTask}
                <div class="task-card">
                    <div class="task-num">{#if $planModeTask.issueNumber}#{$planModeTask.issueNumber}{/if}</div>
                    <div class="task-title">{$planModeTask.title}</div>
                </div>
            {:else}
                <p class="hint">Aucune task sélectionnée</p>
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
.task-card {
    padding: 0.75rem;
}
.task-num {
    font-size: 0.58rem;
    color: #555;
    font-family: 'JetBrains Mono', monospace;
    margin-bottom: 0.25rem;
}
.task-title {
    font-size: 0.72rem;
    color: #aaa;
    font-family: 'JetBrains Mono', monospace;
    line-height: 1.4;
}
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
