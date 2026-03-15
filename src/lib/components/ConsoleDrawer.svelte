<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { agentRunState, stopConsoleStream, toggleConsoleMinimized } from "$lib/stores/agent";
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

    onMount(() => {
        panelHeight = loadHeight();
        window.addEventListener("beforeunload", stopConsoleStream);
        spinnerInterval = setInterval(() => { frame = (frame + 1) % FRAMES.length; }, 80);
    });
    onDestroy(() => {
        window.removeEventListener("beforeunload", stopConsoleStream);
        if (spinnerInterval) clearInterval(spinnerInterval);
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

    $: hasRun  = $agentRunState.taskId !== null;
    $: expanded = hasRun && !$agentRunState.consoleMinimized;
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

        <span class="bar-line" class:sys={lastLine?.type === 'system'}>
            {#if $agentRunState.running}
                {FRAMES[frame]}&nbsp;{lastLine ? lastLine.line.slice(0, 100) : "initialisation…"}
            {:else if lastLine}
                {lastLine.line.slice(0, 120)}
            {:else if $agentRunState.sessionAlive}
                ⬡ session active
            {:else if hasRun}
                terminé
            {:else}
                console
            {/if}
        </span>

        {#if lastTokens && !$agentRunState.running}
            <span class="bar-tokens">{lastTokens}</span>
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
</style>
