<script lang="ts">
    import { get } from "svelte/store";
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
        agentRunState.set({ taskId: null, taskTitle: "", logs: [], running: false, sessionAlive: false, consoleMinimized: false, completionLabel: null });
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
        showInput={!!$agentRunState.taskId && !$agentRunState.running}
        oninterrupt={stop}
        onterminate={terminateSession}
        ondismiss={dismiss}
        oninput={sendFollowUp}
    />
    {#if !$agentRunState.running && lastUsage}
        <PromptUsage usage={lastUsage} context={lastContext} />
    {/if}
</div>

<style>
.run-console-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
}
</style>
