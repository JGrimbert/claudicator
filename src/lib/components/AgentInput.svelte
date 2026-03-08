<script lang="ts">
    import { agentRunState } from "$lib/stores/agent";

    type Task = { id: string; title: string };

    let { task, projectRoot = "" }: { task: Task; projectRoot?: string } = $props();

    let prompt = $state("");
    let loadingContext = $state(false);
    let contextError = $state("");

    // Recharge le prompt contextuel chaque fois que la task change
    $effect(() => {
        const id = task?.id;
        if (!id) { prompt = ""; return; }
        loadContext(id);
    });

    async function loadContext(taskId: string) {
        loadingContext = true;
        contextError = "";
        try {
            const res = await fetch("/api/context", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId, projectRoot: projectRoot || undefined })
            });
            const data = await res.json();
            if (data.error) {
                contextError = data.error;
                prompt = task.title;
            } else {
                prompt = data.prompt ?? task.title;
            }
        } catch (e: any) {
            contextError = e.message;
            prompt = task.title;
        } finally {
            loadingContext = false;
        }
    }

    async function launch() {
        const text = prompt.trim();
        if (!text || $agentRunState.running) return;

        agentRunState.set({ taskId: task.id, taskTitle: task.title, logs: [], running: true });

        try {
            const res = await fetch("/api/agent/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: text, taskId: task.id })
            });
            if (!res.ok || !res.body) {
                agentRunState.update(s => ({
                    ...s, running: false,
                    logs: [...s.logs, { line: `[erreur HTTP ${res.status}]`, type: "system" }]
                }));
                return;
            }
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                for (const raw of dec.decode(value).split("\n")) {
                    if (raw.startsWith("data: ")) {
                        try {
                            const event = JSON.parse(raw.slice(6));
                            agentRunState.update(s => ({ ...s, logs: [...s.logs, event] }));
                        } catch { /* skip */ }
                    }
                }
            }
        } finally {
            agentRunState.update(s => ({ ...s, running: false }));
        }
    }
</script>

<div class="agent-input">
    <div class="ai-header">
        <span class="ai-label">Prompt agent</span>
        {#if loadingContext}
            <span class="ai-hint">Génération du contexte…</span>
        {:else if contextError}
            <span class="ai-hint err" title={contextError}>Contexte indisponible</span>
        {:else}
            <span class="ai-hint">Éditable avant envoi</span>
        {/if}
        <button
            class="ai-reload"
            onclick={() => loadContext(task.id)}
            disabled={loadingContext}
            title="Regénérer le contexte"
        >↺</button>
    </div>

    <textarea
        class="ai-textarea"
        bind:value={prompt}
        rows={8}
        placeholder={loadingContext ? "Génération du contexte…" : "Prompt pour Claude…"}
        disabled={loadingContext}
    ></textarea>

    <div class="ai-footer">
        <button
            class="ai-launch"
            onclick={launch}
            disabled={!prompt.trim() || $agentRunState.running || loadingContext}
        >
            {$agentRunState.running ? "En cours…" : "Lancer l'agent →"}
        </button>
    </div>
</div>

<style>
.agent-input {
    display: flex;
    flex-direction: column;
    border-top: 1px solid #141414;
}
.ai-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 1rem;
    border-bottom: 1px solid #111;
    flex-shrink: 0;
}
.ai-label {
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #333;
}
.ai-hint {
    font-size: 0.6rem;
    color: #2a2a2a;
    font-style: italic;
}
.ai-hint.err { color: #7a2a2a; }
.ai-reload {
    margin-left: auto;
    background: none;
    border: none;
    color: #2a2a2a;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0 0.2rem;
    line-height: 1;
}
.ai-reload:hover:not(:disabled) { color: #7c6af7; }
.ai-reload:disabled { opacity: 0.3; cursor: default; }
.ai-textarea {
    background: #07070f;
    border: none;
    border-bottom: 1px solid #111;
    color: #777;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.67rem;
    line-height: 1.55;
    padding: 0.5rem 1rem;
    resize: vertical;
    outline: none;
    min-height: 80px;
}
.ai-textarea:focus { color: #bbb; }
.ai-textarea::placeholder { color: #222; }
.ai-textarea:disabled { opacity: 0.5; cursor: wait; }
.ai-footer {
    display: flex;
    justify-content: flex-end;
    padding: 0.4rem 1rem;
    flex-shrink: 0;
}
.ai-launch {
    background: #7c6af7;
    border: none;
    border-radius: 3px;
    color: #fff;
    font-size: 0.65rem;
    padding: 0.3rem 0.9rem;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    letter-spacing: 0.03em;
}
.ai-launch:hover:not(:disabled) { background: #9181f9; }
.ai-launch:disabled { opacity: 0.35; cursor: default; }
</style>
