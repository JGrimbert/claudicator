<script lang="ts">
    import { afterUpdate, onMount, onDestroy } from "svelte";
    import { agentRunState, taskRefreshTick } from "$lib/stores/agent";

    const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frame = 0;
    let spinnerInterval: ReturnType<typeof setInterval> | null = null;

    onMount(() => {
        spinnerInterval = setInterval(() => { frame = (frame + 1) % FRAMES.length; }, 80);
    });
    onDestroy(() => { if (spinnerInterval) clearInterval(spinnerInterval); });

    let logArea: HTMLDivElement;
    let userInput = "";
    let sendingInput = false;
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
        agentRunState.set({ taskId: null, taskTitle: "", logs: [], running: false });
    }

    async function sendInput() {
        const text = userInput.trim();
        if (!text || !$agentRunState.taskId || sendingInput) return;
        sendingInput = true;
        try {
            await fetch("/api/agent/input", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId: $agentRunState.taskId, input: text })
            });
            agentRunState.update(s => ({ ...s, logs: [...s.logs, { line: `> ${text}`, type: "system" }] }));
            userInput = "";
        } finally {
            sendingInput = false;
        }
    }

    function onKey(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendInput(); }
    }

    // Filtre les lignes purement techniques ([pid:...]) et les events usage
    $: visibleLogs = $agentRunState.logs.filter(l => l.type !== 'usage' && !/^\[pid:\d+\]$/.test(l.line));
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
            {:else if visibleLogs.length > 0}
                Terminé
            {/if}
        </span>
        {#if $agentRunState.running}
            <button class="btn-stop" onclick={stop}>■ Interrompre</button>
        {/if}
        {#if !$agentRunState.running}
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
        <div class="usage-bar">
            <span class="usage-label">Tokens</span>
            <span class="usage-val">{lastUsage.inputTokens.toLocaleString("fr-FR")} envoyés</span>
            <span class="usage-sep">·</span>
            <span class="usage-val">{lastUsage.outputTokens.toLocaleString("fr-FR")} reçus</span>
        </div>
    {/if}

    <!-- ── Input stdin (pour répondre à Claude) ── -->
    {#if $agentRunState.running}
        <div class="input-bar">
            <span class="prompt-sym">›</span>
            <input
                class="stdin-input"
                type="text"
                placeholder="Répondre à Claude… (Entrée)"
                bind:value={userInput}
                onkeydown={onKey}
                disabled={sendingInput}
            />
            <button
                class="btn-send"
                onclick={sendInput}
                disabled={!userInput.trim() || sendingInput}
            >↵</button>
        </div>
    {/if}
</div>

<style>
.console {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #05050f;
    font-family: 'JetBrains Mono', monospace;
}

/* ── Header ── */
.console-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid #1a1a2a;
    flex-shrink: 0;
    background: #07070f;
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
.log-area::-webkit-scrollbar-thumb { background: #1e1e2e; border-radius: 2px; }
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

/* ── Usage tokens ── */
.usage-bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 1.2rem;
    border-top: 1px solid #1a1a2a;
    flex-shrink: 0;
    background: #07070f;
}
.usage-label {
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #2a2a3a;
    flex-shrink: 0;
}
.usage-val {
    font-size: 0.63rem;
    color: #4a4a6a;
    font-family: 'JetBrains Mono', monospace;
}
.usage-sep {
    font-size: 0.6rem;
    color: #222;
}

/* ── Input stdin ── */
.input-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 1rem;
    border-top: 1px solid #1a1a2a;
    flex-shrink: 0;
    background: #07070f;
}
.prompt-sym {
    color: #3a3a5a;
    font-size: 0.85rem;
    flex-shrink: 0;
}
.stdin-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #777;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
}
.stdin-input:focus { color: #bbb; }
.stdin-input::placeholder { color: #252535; }
.stdin-input:disabled { opacity: 0.4; }
.btn-send {
    background: none;
    border: 1px solid #2a2a3a;
    color: #444;
    font-size: 0.75rem;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
}
.btn-send:hover:not(:disabled) { border-color: #7c6af7; color: #7c6af7; }
.btn-send:disabled { opacity: 0.25; cursor: default; }
</style>
