<script lang="ts">
    import { onMount } from "svelte";
    import { agentRunState, stopConsoleStream, toggleConsoleMinimized, startConsoleStream, taskRefreshTick, type RunLog } from "$lib/stores/agent";
    import RunConsole from "$lib/components/RunConsole.svelte";

    const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frame = 0;
    let spinnerInterval: ReturnType<typeof setInterval> | null = null;

    // ── Redimensionnement vertical ─────────────────────────────────────────────
    const PANEL_HEIGHT_KEY = "claudicator:console-panel-height";
    const MIN_H  = 60;
    const MAX_PCT = 85;

    let panelHeight = 0; // 0 avant mount (évite SSR)
    let dragging    = false;
    let dragStartY  = 0;
    let dragStartH  = 0;

    function clampH(h: number) {
        return Math.max(MIN_H, Math.min(Math.round(window.innerHeight * MAX_PCT / 100), h));
    }

    function loadHeight() {
        try {
            const raw = localStorage.getItem(PANEL_HEIGHT_KEY);
            if (raw) { const v = Number(raw); if (!isNaN(v)) return clampH(v); }
        } catch { /* ignore */ }
        return Math.round(window.innerHeight * 0.55);
    }

    function startDrag(e: MouseEvent) {
        dragging   = true;
        dragStartY = e.clientY;
        dragStartH = panelHeight;
        e.preventDefault();
    }

    function onMove(e: MouseEvent) {
        if (!dragging) return;
        // tirer vers le haut augmente la hauteur
        panelHeight = clampH(dragStartH + (dragStartY - e.clientY));
    }

    function onUp() {
        if (!dragging) return;
        dragging = false;
        try { localStorage.setItem(PANEL_HEIGHT_KEY, String(panelHeight)); } catch { /* ignore */ }
    }

    // ── Reconnexion après refresh ───────────────────────────────────────────────
    let reconnectTaskId: string | null = null;
    let reconnecting = false;

    async function checkReconnect() {
        let storedId: string | null = null;
        let storedTitle: string | null = null;
        try {
            storedId    = sessionStorage.getItem("activeTaskId");
            storedTitle = sessionStorage.getItem("activeTaskTitle");
        } catch { return; }
        if (!storedId) return;

        try {
            const res = await fetch(`/api/agent/session?taskId=${encodeURIComponent(storedId)}`);
            if (!res.ok) { clearStoredSession(); return; }
            const data = await res.json() as { alive: boolean; busy: boolean };
            if (!data.alive) { clearStoredSession(); return; }
            // Session toujours vivante — proposer la reconnexion
            reconnectTaskId = storedId;
            // Pré-remplir le store pour que la barre de statut s'affiche
            agentRunState.update(s => ({
                ...s,
                taskId: storedId,
                taskTitle: storedTitle ?? storedId ?? "",
                sessionAlive: true,
            }));
        } catch { /* ignore */ }
    }

    function clearStoredSession() {
        try {
            sessionStorage.removeItem("activeTaskId");
            sessionStorage.removeItem("activeTaskTitle");
        } catch { /* ignore */ }
    }

    async function reconnect() {
        if (!reconnectTaskId || reconnecting) return;
        const tid = reconnectTaskId;
        reconnecting = true;
        reconnectTaskId = null;
        agentRunState.update(s => ({ ...s, running: true, logs: [], consoleMinimized: false, completionLabel: null }));
        try {
            const res = await fetch("/api/agent/reconnect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId: tid })
            });
            await startConsoleStream(res);
        } finally {
            reconnecting = false;
            agentRunState.update(s => ({ ...s, running: false }));
            taskRefreshTick.update(n => n + 1);
        }
    }

    onMount(() => {
        panelHeight = loadHeight();
        window.addEventListener("beforeunload", stopConsoleStream);
        spinnerInterval = setInterval(() => { frame = (frame + 1) % FRAMES.length; }, 80);
        checkReconnect();
        return () => {
            window.removeEventListener("beforeunload", stopConsoleStream);
            if (spinnerInterval) clearInterval(spinnerInterval);
        };
    });

    // ── Affichage ──────────────────────────────────────────────────────────────
    $: lastLine = (() => {
        const visible = $agentRunState.logs.filter(l =>
            l.type !== 'usage' && l.type !== 'context' && l.type !== 'session_status' &&
            !/^\[pid:\d+\]$/.test(l.line)
        );
        return visible.length > 0 ? visible[visible.length - 1] : null;
    })();

    $: lastTokens = (() => {
        const ul = $agentRunState.logs.filter(l => l.type === 'usage');
        if (!ul.length) return null;
        try {
            const u = JSON.parse(ul[ul.length - 1].line) as { inputTokens: number; outputTokens: number };
            return `${Math.round(u.inputTokens / 100) / 10}k → ${Math.round(u.outputTokens / 100) / 10}k`;
        } catch { return null; }
    })();

    $: hasRun   = $agentRunState.taskId !== null;
    $: expanded = hasRun && !$agentRunState.consoleMinimized;
    $: canPrompt = hasRun;

    let wasRunning = false;
    $: if ($agentRunState.running) wasRunning = true;
    $: if (!$agentRunState.running && wasRunning) {
        wasRunning = false;
        taskRefreshTick.update(n => n + 1);
    }

    // ── Input / prompt ─────────────────────────────────────────────────────────
    let userInput   = "";
    let sendingInput = false;

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
            agentRunState.update(s => ({ ...s, logs: [...s.logs, { line: `> ${text}`, type: "system" as RunLog["type"] }] }));
            userInput = "";
        } finally { sendingInput = false; }
    }

    async function continuer() {
        const text   = userInput.trim();
        const taskId = $agentRunState.taskId;
        if (!text || !taskId || sendingInput) return;
        sendingInput = true;
        userInput    = "";
        agentRunState.update(s => ({ ...s, running: true, logs: [], consoleMinimized: false, completionLabel: null }));
        try {
            // Toujours one-shot avec contexte : les sessions stdin ne sont pas fiables sur Windows
            const res = await fetch("/api/agent/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId, prompt: text, contextFollowUp: true })
            });
            await startConsoleStream(res);
        } finally {
            sendingInput = false;
            agentRunState.update(s => ({ ...s, running: false }));
            taskRefreshTick.update(n => n + 1);
        }
    }

    function onInputKey(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if ($agentRunState.running) sendInput();
            else if (canPrompt)         continuer();
        }
    }
</script>

<svelte:window onmousemove={onMove} onmouseup={onUp} />

<div class="console-wrap" class:dragging>

    <!-- ── Handle redimensionnable (double bordure) — toujours en haut du panel ── -->
    {#if expanded && panelHeight > 0}
        <div
            class="vhandle"
            class:active={dragging}
            role="separator"
            aria-label="Redimensionner la console"
            onmousedown={startDrag}
        ></div>
    {/if}

    <!-- ── Panel de sortie ── -->
    {#if expanded && panelHeight > 0}
        <div class="console-panel" style="height: {panelHeight}px">
            <RunConsole />
        </div>
    {/if}

    <!-- ── Barre de continuation (fin de run, session vivante) ── -->
    {#if expanded && !$agentRunState.running && $agentRunState.sessionAlive && panelHeight > 0}
        <div class="completion-bar">
            <span class="completion-sym">›</span>
            <input
                class="completion-input"
                type="text"
                placeholder="Continuer le prompt…"
                bind:value={userInput}
                onkeydown={onInputKey}
            />
            <button
                class="completion-send"
                onclick={continuer}
                disabled={!userInput.trim() || sendingInput}
            >↵</button>
        </div>
    {/if}

    <!-- ── Badge de reconnexion ── -->
    {#if reconnectTaskId}
        <div class="reconnect-bar">
            <span class="reconnect-dot"></span>
            <span class="reconnect-label">Session en cours</span>
            <button class="reconnect-btn" onclick={reconnect} disabled={reconnecting}>
                {reconnecting ? "…" : "Reprendre"}
            </button>
            <button class="reconnect-dismiss" onclick={() => { reconnectTaskId = null; clearStoredSession(); }} title="Ignorer">✕</button>
        </div>
    {/if}

    <!-- ── Barre de statut (toujours visible) ── -->
    <div class="console-bar">
        <span
            class="dot"
            class:running={$agentRunState.running}
            class:session={$agentRunState.sessionAlive && !$agentRunState.running}
            class:idle={!hasRun}
        ></span>

        {#if hasRun}
            <button class="bar-toggle" onclick={toggleConsoleMinimized} title={expanded ? "Réduire" : "Développer"}>
                {expanded ? "▼" : "▲"}
            </button>
            <span class="bar-task">{$agentRunState.taskTitle.slice(0, 24)}</span>
            <span class="bar-sep">·</span>
        {/if}

        {#if canPrompt}
            <span class="prompt-sym">›</span>
            <input
                class="bar-input"
                type="text"
                placeholder={$agentRunState.running ? "Répondre à Claude… (Entrée)" : "Envoyer un suivi… (Entrée)"}
                bind:value={userInput}
                onkeydown={onInputKey}
                disabled={sendingInput || $agentRunState.running}
            />
            <button
                class="bar-send"
                onclick={$agentRunState.running ? sendInput : continuer}
                disabled={!userInput.trim() || sendingInput || $agentRunState.running}
            >↵</button>
        {:else}
            <span class="bar-line" class:sys={lastLine?.type === 'system'}>
                {#if lastLine}
                    {lastLine.line.slice(0, 120)}
                {:else if hasRun}
                    terminé
                {:else}
                    console
                {/if}
            </span>
            {#if lastTokens}
                <span class="bar-tokens">{lastTokens}</span>
            {/if}
        {/if}
    </div>

</div>

<style>
.console-wrap {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 200;
    display: flex;
    flex-direction: column;
    font-family: 'JetBrains Mono', monospace;
}
.console-wrap.dragging { cursor: row-resize; user-select: none; }

/* ── Panel de sortie ── */
.console-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-panel);
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.6);
}

/* ── Handle redimensionnable (double bordure) ── */
.vhandle {
    flex-shrink: 0;
    height: 6px;
    cursor: row-resize;
    border-top: 1px solid #1e1e1e;
    border-bottom: 1px solid #1e1e1e;
    background: var(--bg-panel);
    transition: border-color 0.15s;
}
.vhandle:hover, .vhandle.active { border-color: #3a3a3a; }

/* ── Barre de continuation ── */
.completion-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 1rem;
    background: var(--bg-panel);
    border-top: 1px solid #1a3020;
    flex-shrink: 0;
}
.completion-sym {
    color: #3a7a4a;
    font-size: 0.85rem;
    flex-shrink: 0;
    line-height: 1;
}
.completion-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: #888;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    padding: 0;
}
.completion-input:focus { color: #bbb; }
.completion-input::placeholder { color: #2a4a2a; }
.completion-send {
    background: none;
    border: 1px solid #2a3a2a;
    color: #3a5a3a;
    font-size: 0.7rem;
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    line-height: 1.2;
    font-family: 'JetBrains Mono', monospace;
}
.completion-send:hover:not(:disabled) { border-color: #3a7a4a; color: #3a7a4a; }
.completion-send:disabled { opacity: 0.2; cursor: default; }

/* ── Badge reconnexion ── */
.reconnect-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 1rem;
    background: #0e1a12;
    border-top: 1px solid #1a3020;
    flex-shrink: 0;
}
.reconnect-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #3a7a4a;
    animation: pulse 1.4s ease-in-out infinite;
    flex-shrink: 0;
}
.reconnect-label {
    font-size: 0.6rem;
    color: #3a7a4a;
    flex: 1;
}
.reconnect-btn {
    background: none;
    border: 1px solid #3a7a4a;
    color: #3a7a4a;
    font-size: 0.6rem;
    padding: 0.1rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
}
.reconnect-btn:hover:not(:disabled) { border-color: #5aaa6a; color: #5aaa6a; }
.reconnect-btn:disabled { opacity: 0.5; cursor: default; }
.reconnect-dismiss {
    background: none;
    border: none;
    color: #2a4a2a;
    font-size: 0.6rem;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    line-height: 1;
}
.reconnect-dismiss:hover { color: #4a6a4a; }

/* ── Barre de statut ── */
.console-bar {
    height: 26px;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 1rem;
    background: var(--bg-panel);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
}

.dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
    background: #252535;
    transition: background 0.3s;
}
.dot.running {
    background: #7c6af7;
    animation: pulse 1.4s ease-in-out infinite;
}
.dot.session { background: #3a7a4a; }
.dot.idle    { background: #1e1e2e; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.bar-toggle {
    background: none;
    border: none;
    color: #2a2a3a;
    font-size: 0.42rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
}
.bar-toggle:hover { color: #555; }

.bar-task {
    font-size: 0.55rem;
    color: #4a3a7a;
    white-space: nowrap;
    flex-shrink: 0;
}
.bar-sep {
    color: #1e1e2e;
    font-size: 0.55rem;
    flex-shrink: 0;
}

.bar-line {
    font-size: 0.6rem;
    color: #2e2e4e;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.bar-line.sys { color: #252535; font-style: italic; }

.bar-tokens {
    font-size: 0.55rem;
    color: #3a3a5a;
    flex-shrink: 0;
    white-space: nowrap;
}

/* ── Input prompt ── */
.prompt-sym {
    color: #3a3a5a;
    font-size: 0.85rem;
    flex-shrink: 0;
    line-height: 1;
}
.bar-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: #888;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    padding: 0;
}
.bar-input:focus { color: #bbb; }
.bar-input::placeholder { color: #252535; }
.bar-input:disabled { opacity: 0.4; }
.bar-send {
    background: none;
    border: 1px solid #2a2a3a;
    color: #3a3a5a;
    font-size: 0.7rem;
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    line-height: 1.2;
}
.bar-send:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.bar-send:disabled { opacity: 0.2; cursor: default; }
</style>
