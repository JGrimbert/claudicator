<script lang="ts">
    import { onMount } from "svelte";
    import { agentRunState, stopConsoleStream, toggleConsoleMinimized } from "$lib/stores/agent";
    import RunConsole from "$lib/components/RunConsole.svelte";

    onMount(() => {
        window.addEventListener("beforeunload", stopConsoleStream);
        return () => window.removeEventListener("beforeunload", stopConsoleStream);
    });
</script>

{#if $agentRunState.taskId !== null}
    <div class="drawer" class:expanded={!$agentRunState.consoleMinimized}>
        <!-- ── Onglet ── -->
        <button class="drawer-tab" onclick={toggleConsoleMinimized}>
            <span class="indicator" class:running={$agentRunState.running}></span>
            <span class="tab-label">console</span>
            {#if $agentRunState.taskTitle}
                <span class="tab-task">{$agentRunState.taskTitle.slice(0, 28)}</span>
            {/if}
            <span class="tab-chevron">{$agentRunState.consoleMinimized ? "▲" : "▼"}</span>
        </button>
        <!-- ── Contenu ── -->
        {#if !$agentRunState.consoleMinimized}
            <div class="drawer-content">
                <RunConsole />
            </div>
        {/if}
    </div>
{/if}

<style>
.drawer {
    position: fixed;
    bottom: 0;
    right: 1.5rem;
    z-index: 200;
    width: 480px;
    display: flex;
    flex-direction: column;
    background: var(--bg-panel);
    border: 1px solid var(--border-strong);
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.5);
    font-family: 'JetBrains Mono', monospace;
}

/* ── Onglet ── */
.drawer-tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.8rem;
    background: none;
    border: none;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    width: 100%;
    text-align: left;
    font-family: 'JetBrains Mono', monospace;
}
.drawer-tab:hover { background: rgba(255, 255, 255, 0.02); }

/* Loupiotte */
.indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #333;
    flex-shrink: 0;
    transition: background 0.3s;
}
.indicator.running {
    background: #7c6af7;
    animation: pulse 1.8s ease-in-out infinite;
}
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.2; }
}

.tab-label {
    font-size: 0.55rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #555;
    flex-shrink: 0;
}
.tab-task {
    font-size: 0.6rem;
    color: #7c6af7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
}
.tab-chevron {
    font-size: 0.5rem;
    color: #333;
    flex-shrink: 0;
}

/* ── Contenu développé ── */
.drawer-content {
    height: 55vh;
    max-height: 55vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
</style>
