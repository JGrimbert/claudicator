<script lang="ts">
    import { globalPlanPrompt, agentRunState, startConsoleStream, planModeTask } from "$lib/stores/agent";
    import CtaButton from "$lib/components/CtaButton.svelte";

    let launching = false;

    function clear() {
        globalPlanPrompt.set(null);
    }

    async function launch() {
        if (launching || $agentRunState.running) return;
        const prompt = $globalPlanPrompt;
        if (!prompt) return;
        launching = true;
        agentRunState.update(s => ({ ...s, running: true, logs: [], taskId: null, taskTitle: "Plan global" }));
        try {
            const res = await fetch("/api/agent/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt }),
            });
            await startConsoleStream(res);
        } finally {
            launching = false;
        }
    }
</script>

<div class="view">
    <div class="header">
        <span class="title">Plan global</span>
        <button class="close-btn" onclick={clear} title="Fermer">✕</button>
    </div>
    <div class="prompt-area">
        <pre class="prompt-text">{$globalPlanPrompt ?? ""}</pre>
    </div>
    <div class="footer">
        <CtaButton
            label="Lancer l'agent"
            loading={launching || $agentRunState.running}
            useCase="launch-global-plan"
            onclick={launch}
        />
    </div>
</div>

<style>
.view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
}
.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg-panel);
}
.title {
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #666;
    font-family: 'JetBrains Mono', monospace;
}
.close-btn {
    all: unset;
    cursor: pointer;
    font-size: 0.7rem;
    color: #444;
    padding: 0 0.25rem;
    transition: color 0.1s;
}
.close-btn:hover { color: #888; }
.prompt-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.75rem;
}
.prompt-area::-webkit-scrollbar { width: 4px; }
.prompt-area::-webkit-scrollbar-track { background: transparent; }
.prompt-area::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.prompt-text {
    font-size: 0.62rem;
    font-family: 'JetBrains Mono', monospace;
    color: #666;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    line-height: 1.55;
}
.footer {
    flex-shrink: 0;
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
}
</style>
