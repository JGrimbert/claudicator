<script lang="ts">
    import { afterUpdate, onMount, onDestroy } from "svelte";
    import { agentRunState, taskRefreshTick, type RunLog } from "$lib/stores/agent";
    import PromptUsage from "$lib/components/PromptUsage.svelte";

    const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frame = 0;
    let spinnerInterval: ReturnType<typeof setInterval> | null = null;

    onMount(() => {
        spinnerInterval = setInterval(() => { frame = (frame + 1) % FRAMES.length; }, 80);
    });
    onDestroy(() => { if (spinnerInterval) clearInterval(spinnerInterval); });

    let logArea: HTMLDivElement;
    let autoScroll = true;

    afterUpdate(() => {
        if (autoScroll && logArea) logArea.scrollTop = logArea.scrollHeight;
    });

    function onScroll() {
        if (!logArea) return;
        const atBottom = logArea.scrollHeight - logArea.scrollTop - logArea.clientHeight < 40;
        autoScroll = atBottom;
    }

    async function stop() {
        const id = $agentRunState.taskId;
        if (!id) return;
        await fetch("/api/agent/kill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: id })
        });
        agentRunState.update(s => ({ ...s, running: false }));
        taskRefreshTick.update(n => n + 1);
    }

    function dismiss() {
        agentRunState.set({ taskId: null, taskTitle: "", logs: [], running: false, sessionAlive: false, consoleMinimized: false });
    }

    async function terminateSession() {
        const taskId = $agentRunState.taskId;
        if (!taskId) return;
        await fetch("/api/agent/session", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId })
        });
        agentRunState.update(s => ({ ...s, sessionAlive: false }));
        taskRefreshTick.update(n => n + 1);
    }

    // Filtre les lignes purement techniques ([pid:...]) et les events usage/context/session_status
    $: visibleLogs = $agentRunState.logs.filter(l => l.type !== 'usage' && l.type !== 'context' && l.type !== 'session_status' && !/^\[pid:\d+\]$/.test(l.line));
    $: systemLogs  = $agentRunState.logs.filter(l => l.type === 'system' && !/^\[pid:\d+\]$/.test(l.line));
    $: agentLogs   = $agentRunState.logs.filter(l => l.type === 'agent');

    // Extraction des tokens depuis les events SSE de type "usage"
    type TokenUsage = { inputTokens: number; outputTokens: number };
    $: lastUsage = (() => {
        const usageLogs = $agentRunState.logs.filter(l => l.type === 'usage');
        if (usageLogs.length === 0) return null;
        try { return JSON.parse(usageLogs[usageLogs.length - 1].line) as TokenUsage; }
        catch { return null; }
    })();

    // Extraction du contexte d'enrichissement depuis les events SSE de type "context"
    type ContextStats = { methods: number; hasAtlas: boolean };
    $: lastContext = (() => {
        const ctxLogs = $agentRunState.logs.filter(l => l.type === 'context');
        if (ctxLogs.length === 0) return undefined;
        try { return JSON.parse(ctxLogs[ctxLogs.length - 1].line) as ContextStats; }
        catch { return undefined; }
    })();

    // Debounce du dernier message système pour éviter le clignotement
    let statusLine = "";
    let statusDebounce: ReturnType<typeof setTimeout> | null = null;
    $: {
        if (systemLogs.length > 0) {
            if (statusDebounce) clearTimeout(statusDebounce);
            statusDebounce = setTimeout(() => {
                statusLine = systemLogs[systemLogs.length - 1].line;
            }, 150);
        } else {
            statusLine = "";
        }
    }
</script>

<div class="console">
    <!-- ── Header ── -->
    <div class="console-header">
        <span class="dot" class:running={$agentRunState.running}></span>
        <span class="console-label">Console</span>
        <span class="task-title">{$agentRunState.taskTitle}</span>
        <span class="status-text">
            {#if $agentRunState.running}
                {visibleLogs.length === 0 ? "Initialisation…" : "En cours…"}
            {:else if $agentRunState.sessionAlive}
                session active
            {:else if visibleLogs.length > 0}
                Terminé
            {/if}
        </span>
        {#if $agentRunState.sessionAlive && !$agentRunState.running}
            <span class="badge-session">⬡ session</span>
        {/if}
        {#if $agentRunState.running}
            <button class="btn-stop" onclick={stop}>■ Interrompre</button>
        {/if}
        {#if $agentRunState.sessionAlive && !$agentRunState.running}
            <button class="btn-terminate" onclick={terminateSession}>⏹ Terminer</button>
        {/if}
        {#if !$agentRunState.running && !$agentRunState.sessionAlive}
            <button class="btn-dismiss" onclick={dismiss}>✕ Fermer</button>
        {/if}
    </div>

    <!-- ── Logs ── -->
    <div
        class="log-area"
        bind:this={logArea}
        onscroll={onScroll}
    >
        {#if visibleLogs.length === 0}
            {#if $agentRunState.running}
                {#if statusLine}
                    <span class="hint status">{FRAMES[frame]} {statusLine}</span>
                {:else}
                    <span class="hint blink">{FRAMES[frame]} En attente de la première sortie…</span>
                {/if}
            {:else}
                <span class="hint">Aucune sortie</span>
            {/if}
        {:else}
            {#each visibleLogs as entry}
                <div class="log-line" class:sys={entry.type === "system"}>{entry.line}</div>
            {/each}
        {/if}
    </div>

    <!-- ── Tokens (affiché en fin de run si présent) ── -->
    {#if !$agentRunState.running && lastUsage}
        <PromptUsage usage={lastUsage} context={lastContext} />
    {/if}

</div>

<style>
.console {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-deep);
    font-family: 'JetBrains Mono', monospace;
}

/* ── Header ── */
.console-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg-panel);
}
.dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #333;
    flex-shrink: 0;
    transition: background 0.3s;
}
.dot.running {
    background: #7c6af7;
    animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.console-label {
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #333;
    flex-shrink: 0;
}
.task-title {
    font-size: 0.65rem;
    color: #7c6af7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
}
.status-text {
    font-size: 0.6rem;
    color: #2e2e2e;
    flex-shrink: 0;
    font-style: italic;
}
.btn-stop {
    background: none;
    border: 1px solid #3a2a2a;
    color: #a04040;
    font-size: 0.62rem;
    padding: 0.15rem 0.55rem;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
}
.btn-stop:hover { border-color: #f44336; color: #f44336; }
.btn-dismiss {
    background: none;
    border: 1px solid #1e1e1e;
    color: #333;
    font-size: 0.62rem;
    padding: 0.15rem 0.55rem;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
}
.btn-dismiss:hover { border-color: #555; color: #777; }
.badge-session {
    font-size: 0.58rem;
    color: #3a7a4a;
    border: 1px solid #1e3a2a;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    flex-shrink: 0;
    letter-spacing: 0.05em;
}
.btn-terminate {
    background: none;
    border: 1px solid #2a2a1e;
    color: #5a5a30;
    font-size: 0.62rem;
    padding: 0.15rem 0.55rem;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
}
.btn-terminate:hover { border-color: #a09030; color: #c0b040; }

/* ── Logs ── */
.log-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.6rem 1.2rem;
    scroll-behavior: smooth;
}
.log-area::-webkit-scrollbar { width: 4px; }
.log-area::-webkit-scrollbar-track { background: transparent; }
.log-area::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.log-line {
    font-size: 0.7rem;
    color: #aaa;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
}
.log-line.sys {
    color: #3a3a5a;
    font-style: italic;
}
.hint {
    display: block;
    padding: 0.4rem 0;
    color: #2a2a3a;
    font-size: 0.68rem;
    font-style: italic;
}
.blink { animation: blink 1.2s step-start infinite; }
@keyframes blink { 50% { opacity: 0.3; } }
.hint.status {
    color: #4a9eff;
    font-style: italic;
    font-size: 0.7rem;
    opacity: 0.75;
}


</style>
