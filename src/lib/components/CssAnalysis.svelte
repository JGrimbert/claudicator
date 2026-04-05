<script lang="ts">
    import { cssAnalysis, notifyTaskCreated } from "$lib/stores/agent";
    import { readAnalysisStream } from "$lib/utils/analysisStream";
    import { JgrCta, JgrPre } from "jgr-ui";

    let taskCreating = $state(false);
    let taskDone = $state(false);

    async function createTask() {
        if (taskCreating || taskDone) return;
        taskCreating = true;
        try {
            const res = await fetch("/api/css-analysis/task", { method: "POST" });
            if (res.ok) {
                const task = await res.json();
                taskDone = true;
                notifyTaskCreated(task?.id);
            }
        } finally {
            taskCreating = false;
        }
    }

    let logEl = $state<HTMLElement | null>(null);

    async function analyze() {
        cssAnalysis.update(s => ({ ...s, running: true, result: null, logs: [] }));
        try {
            const res = await fetch("/api/css-analysis", { method: "POST" });
            if (!res.ok || !res.body) {
                cssAnalysis.update(s => ({ ...s, running: false }));
                return;
            }
            await readAnalysisStream(res, entry =>
                cssAnalysis.update(s => ({ ...s, logs: [...s.logs, entry] }))
            );
        } finally {
            const r = await fetch("/api/css-analysis");
            if (r.ok) {
                const data = await r.json();
                cssAnalysis.update(s => ({ ...s, result: data?.content ?? null, running: false }));
            } else {
                cssAnalysis.update(s => ({ ...s, running: false }));
            }
        }
    }

    $effect(() => {
        if ($cssAnalysis.logs.length && logEl) {
            logEl.scrollTop = logEl.scrollHeight;
        }
    });

    const spinner = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
    let spinnerIdx = $state(0);
    $effect(() => {
        if (!$cssAnalysis.running) return;
        const t = setInterval(() => { spinnerIdx = (spinnerIdx + 1) % spinner.length; }, 100);
        return () => clearInterval(t);
    });
</script>

<div class="css-wrap">
    {#if $cssAnalysis.running}
        <div class="css-status">
            <span class="spin">{spinner[spinnerIdx]}</span>
            Analyse CSS en cours…
        </div>
        <div class="css-logs" bind:this={logEl}>
            {#each $cssAnalysis.logs.slice(-40) as log}
                <div class="log-line" class:sys={log.type === "system"}>{log.line}</div>
            {/each}
        </div>
    {:else if $cssAnalysis.result}
        <div class="css-header">
            <span class="css-done">✓ Analyse terminée</span>
            <div class="css-actions">
                <button
                    class="task-btn"
                    class:done={taskDone}
                    disabled={taskCreating || taskDone}
                    onclick={createTask}
                >
                    {taskDone ? "✓ Tâche créée" : taskCreating ? "…" : "→ Créer tâche"}
                </button>
                <button class="re-btn" onclick={analyze}>↺</button>
            </div>
        </div>
        <div class="css-result">
            <JgrPre content={$cssAnalysis.result} maxLines={30} />
        </div>
    {:else}
        <div class="css-empty">
            <p class="hint">Analyse les blocs CSS de tous les composants Svelte du projet.</p>
            <p class="hint">Détecte les classes mortes, patterns répétés, classes métier à abstraire et candidats jgr-ui.</p>
            <JgrCta label="Analyser CSS" onclick={analyze} />
        </div>
    {/if}
</div>

<style>
    .css-wrap {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        padding: 0.5rem 0.75rem;
        gap: 0.5rem;
    }

    .css-empty {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding-top: 0.5rem;
    }

    .hint {
        font-size: 0.65rem;
        color: var(--text-muted);
        line-height: 1.5;
        margin: 0;
    }

    .css-status {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.65rem;
        color: var(--text-secondary);
        font-family: 'JetBrains Mono', monospace;
        flex-shrink: 0;
    }

    .spin {
        color: var(--accent);
    }

    .css-logs {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.58rem;
        color: var(--text-muted);
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
    }

    .log-line { white-space: pre-wrap; word-break: break-all; }
    .log-line.sys { color: var(--text-dim, #333); }

    .css-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
    }

    .css-actions {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }

    .task-btn {
        background: none;
        border: 1px solid var(--accent);
        color: var(--accent);
        font-size: 0.6rem;
        font-family: 'JetBrains Mono', monospace;
        padding: 0.2rem 0.5rem;
        cursor: pointer;
        border-radius: 2px;
        transition: background 0.1s;
    }
    .task-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 15%, transparent); }
    .task-btn:disabled { opacity: 0.5; cursor: default; }
    .task-btn.done { border-color: #4caf50; color: #4caf50; }

    .css-done {
        font-size: 0.62rem;
        color: #4caf50;
        font-family: 'JetBrains Mono', monospace;
    }

    .re-btn {
        background: none;
        border: 1px solid var(--border);
        color: var(--text-muted);
        font-size: 0.6rem;
        font-family: 'JetBrains Mono', monospace;
        padding: 0.2rem 0.4rem;
        cursor: pointer;
        border-radius: 2px;
    }
    .re-btn:hover { border-color: var(--border-strong); color: var(--text-secondary); }

    .css-result {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }
</style>
