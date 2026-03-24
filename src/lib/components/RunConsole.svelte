<script lang="ts">
    import { get } from "svelte/store";
    import { onDestroy } from "svelte";
    import { agentRunState, taskRefreshTick, startConsoleStream } from "$lib/stores/agent";
    import { JgrConsole } from 'jgr-ui';
    import type { LogEntry } from 'jgr-ui';
    import PromptUsage from "$lib/components/PromptUsage.svelte";

    // Extraction des tokens depuis les events SSE de type "usage"
    type TokenUsage = { inputTokens: number; outputTokens: number };
    type ContextStats = { methods: number; hasAtlas: boolean };

    $: lastUsage = (() => {
        const usageLogs = $agentRunState.logs.filter(l => l.type === 'usage');
        if (usageLogs.length === 0) return null;
        try { return JSON.parse(usageLogs[usageLogs.length - 1].line) as TokenUsage; }
        catch { return null; }
    })();

    $: lastContext = (() => {
        const ctxLogs = $agentRunState.logs.filter(l => l.type === 'context');
        if (ctxLogs.length === 0) return undefined;
        try { return JSON.parse(ctxLogs[ctxLogs.length - 1].line) as ContextStats; }
        catch { return undefined; }
    })();

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
        agentRunState.set({ taskId: null, taskTitle: "", logs: [], running: false, sessionAlive: false, consoleMinimized: false, completionLabel: null, liveUsage: null });
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

    function playDone() {
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.6);
            osc.onended = () => ctx.close();
        } catch {}
    }

    // ── Timer live ──────────────────────────────────────────────────────────────
    let startTime: number | null = null;
    let elapsed = 0;
    let _timerInterval: ReturnType<typeof setInterval> | null = null;
    $: {
        const running = $agentRunState.running;
        if (running) {
            if (!_timerInterval) {
                startTime = Date.now();
                elapsed = 0;
                _timerInterval = setInterval(() => {
                    elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
                }, 1000);
            }
        } else if (_timerInterval) {
            clearInterval(_timerInterval);
            _timerInterval = null;
        }
    }
    onDestroy(() => { if (_timerInterval) clearInterval(_timerInterval); });

    function fmtElapsed(s: number): string {
        if (s < 60) return `${s}s`;
        return `${Math.floor(s / 60)}m${s % 60 > 0 ? (s % 60) + 's' : ''}`;
    }

    let _wasRunning = false;
    $: {
        const now = $agentRunState.running;
        if (_wasRunning && !now) playDone();
        _wasRunning = now;
    }

    async function sendFollowUp(text: string) {
        const taskId = $agentRunState.taskId;
        if (!taskId || !text.trim()) return;
        agentRunState.update(s => ({ ...s, running: true, logs: [], completionLabel: null }));
        const res = await fetch("/api/agent/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: text, taskId, contextFollowUp: true })
        });
        await startConsoleStream(res, { onDone: () => taskRefreshTick.update(n => n + 1) });
    }
</script>

<div class="run-console-wrap">
    <JgrConsole
        logs={$agentRunState.logs as LogEntry[]}
        running={$agentRunState.running}
        title={$agentRunState.taskTitle}
        completionLabel={$agentRunState.completionLabel ?? undefined}
        sessionAlive={$agentRunState.sessionAlive}
        showInput={!$agentRunState.running}
        oninterrupt={stop}
        onterminate={terminateSession}
        ondismiss={dismiss}
        oninput={sendFollowUp}
    />
    {#if $agentRunState.running}
        <div class="live-bar">
            <span class="live-elapsed">{fmtElapsed(elapsed)}</span>
            {#if lastUsage}
                <span class="live-tok">{Math.round(lastUsage.inputTokens / 100) / 10}k in</span>
                <span class="live-sep">·</span>
                <span class="live-tok">{Math.round(lastUsage.outputTokens / 100) / 10}k out</span>
            {/if}
        </div>
    {:else if lastUsage}
        <PromptUsage usage={lastUsage} context={lastContext} />
    {/if}
</div>

<style>
.run-console-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
}
.live-bar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.3rem 1.2rem;
    border-top: 1px solid #1a1a2a;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    background: #07070f;
    flex-shrink: 0;
}
.live-elapsed { color: cornsilk; opacity: 0.7; }
.live-tok     { color: #4a4a6a; }
.live-sep     { color: #222; }
</style>
