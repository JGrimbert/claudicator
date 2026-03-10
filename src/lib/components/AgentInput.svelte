<script lang="ts">
    import { agentRunState, taskRefreshTick } from "$lib/stores/agent";
    import ContextViewer from "$lib/components/ContextViewer.svelte";

    type Task = { id: string; title: string };
    type SymbolGroup = { file?: string; sigs: string[] };

    let { task, projectRoot = "" }: { task: Task; projectRoot?: string } = $props();

    let prompt = $state("");
    let loadingContext = $state(false);
    let contextError = $state("");
    let loadedId = $state("");
    let showPromptModal = $state(false);
    let symbolMap = $state<Record<string, SymbolGroup>>({});

    let byFile = $derived.by(() => {
        const m = new Map<string, { cls: string; sigs: string[] }[]>();
        for (const [cls, group] of Object.entries(symbolMap)) {
            const file = group.file ?? "?";
            if (!m.has(file)) m.set(file, []);
            m.get(file)!.push({ cls, sigs: group.sigs });
        }
        return [...m.entries()];
    });

    // Recharge le prompt uniquement si l'ID de la task change réellement
    $effect(() => {
        const id = task?.id ?? "";
        if (!id || id === loadedId) return;
        loadedId = id;
        loadContext(id);
    });

    let hasPlan = $state(false);

    async function loadContext(taskId: string) {
        loadingContext = true;
        contextError = "";
        hasPlan = false;
        try {
            // Charger le plan existant en priorité
            const planRes = await fetch(`/api/tasks/${taskId}/plan`);
            const planData = await planRes.json();
            if (planData.content) {
                prompt = planData.content;
                hasPlan = true;
                symbolMap = {};
                return;
            }
            // Pas de plan → générer le contexte
            const res = await fetch("/api/context", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId, projectRoot: projectRoot || undefined })
            });
            const data = await res.json();
            if (data.error) {
                contextError = data.error;
                prompt = task.title;
                symbolMap = {};
            } else {
                prompt = data.prompt ?? task.title;
                symbolMap = data.symbolMap ?? {};
            }
        } catch (e: any) {
            contextError = e.message;
            prompt = task.title;
            symbolMap = {};
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
                body: JSON.stringify({ prompt: text, taskId: task.id, projectRoot: projectRoot || undefined })
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
            taskRefreshTick.update(n => n + 1);
        }
    }

    // ── Split redimensionnable prompt / contexte ───────────────────────────────
    const SPLIT_KEY = "claudicator:agent-input-split";
    let splitPct = $state(55);
    let splitEl: HTMLElement | null = null;
    let dragging = $state(false);
    let dragStartY = 0;
    let dragStartPct = 55;

    $effect(() => {
        try {
            const v = Number(localStorage.getItem(SPLIT_KEY));
            if (!isNaN(v) && v >= 20 && v <= 85) splitPct = v;
        } catch { /* ignore */ }
    });

    function startDrag(e: MouseEvent) {
        dragging = true;
        dragStartY = e.clientY;
        dragStartPct = splitPct;
        e.preventDefault();
    }

    function onMove(e: MouseEvent) {
        if (!dragging || !splitEl) return;
        const h = splitEl.offsetHeight;
        const deltaPct = ((e.clientY - dragStartY) / h) * 100;
        splitPct = Math.max(20, Math.min(85, dragStartPct + deltaPct));
    }

    function onUp() {
        if (!dragging) return;
        dragging = false;
        try { localStorage.setItem(SPLIT_KEY, String(splitPct)); } catch { /* ignore */ }
    }
</script>

<svelte:window onmousemove={onMove} onmouseup={onUp} />

<div class="agent-input" bind:this={splitEl} class:dragging>

    <!-- ── Prompt (haut) ── -->
    <div class="prompt-pane" style="height: {splitPct}%">
        <div class="ai-header">
            <span class="ai-label">Prompt agent</span>
            {#if loadingContext}
                <span class="ai-hint">Chargement…</span>
            {:else if contextError}
                <span class="ai-hint err" title={contextError}>Contexte indisponible</span>
            {:else if hasPlan}
                <span class="ai-hint plan">Plan existant</span>
            {:else}
                <span class="ai-hint">Éditable avant envoi</span>
            {/if}
            <button
                class="ai-reload"
                onclick={() => { loadedId = ""; loadContext(task.id); }}
                disabled={loadingContext}
                title="Regénérer le contexte"
            >↺</button>
        </div>

        <textarea
            class="ai-textarea"
            bind:value={prompt}
            placeholder={loadingContext ? "Génération du contexte…" : "Prompt pour Claude…"}
            disabled={loadingContext}
        ></textarea>

        {#if !hasPlan && byFile.length > 0}
            <div class="sym-diag">
                <div class="sym-diag-header">
                    <span class="sym-diag-label">Entrées principales</span>
                    <span class="sym-diag-hint">analyser en priorité avant toute autre recherche</span>
                </div>
                <div class="sym-diag-body">
                    {#each byFile as [file, classes]}
                        <div class="sym-file">
                            <span class="sym-file-path">{file}</span>
                            {#each classes as { cls, sigs }}
                                <div class="sym-cls">
                                    <span class="sym-cls-name">{cls}</span>
                                    {#each sigs as sig, i}
                                        <div class="sym-sig">
                                            <span class="sym-tree">{i === sigs.length - 1 ? '└─' : '├─'}</span>
                                            <span class="sym-sig-text">{sig}</span>
                                        </div>
                                    {/each}
                                </div>
                            {/each}
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <div class="ai-footer">
            <button
                class="ai-preview-btn"
                onclick={() => showPromptModal = true}
                disabled={!prompt.trim() || loadingContext}
                title="Voir le prompt complet envoyé à Claude"
            >{"{ prompt }"}</button>
            <button
                class="ai-launch"
                onclick={launch}
                disabled={!prompt.trim() || $agentRunState.running || loadingContext}
            >
                {$agentRunState.running ? "En cours…" : "Lancer l'agent →"}
            </button>
        </div>
    </div>

    <!-- ── Séparateur redimensionnable ── -->
    <div
        class="vhandle"
        role="separator"
        aria-label="Redimensionner prompt / contexte carto"
        onmousedown={startDrag}
        class:active={dragging}
    ></div>

    <!-- ── Contexte carto (bas) ── -->
    <div class="ctx-pane">
        <ContextViewer taskId={task.id} />
    </div>

</div>

<!-- ── Modal prompt complet ── -->
{#if showPromptModal}
    <div class="prompt-modal-overlay" role="dialog" aria-modal="true" onclick={() => showPromptModal = false}>
        <div class="prompt-modal" onclick={e => e.stopPropagation()}>
            <div class="prompt-modal-header">
                <span class="prompt-modal-title">Prompt envoyé à Claude</span>
                <button class="prompt-modal-close" onclick={() => showPromptModal = false}>✕</button>
            </div>
            <pre class="prompt-modal-body">{prompt}</pre>
        </div>
    </div>
{/if}

<style>
.agent-input {
    display: flex;
    flex-direction: column;
    height: 100%;
    border-top: 1px solid #141414;
}
.agent-input.dragging { user-select: none; cursor: row-resize; }

/* ── Prompt pane ── */
.prompt-pane {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-height: 0;
    overflow: hidden;
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
.ai-hint.err  { color: #7a2a2a; }
.ai-hint.plan { color: #4a7a4a; }
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
    flex: 1;
    min-height: 0;
    background: #07070f;
    border: none;
    border-bottom: 1px solid #111;
    color: #777;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.67rem;
    line-height: 1.55;
    padding: 0.5rem 1rem;
    resize: none;
    outline: none;
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

/* ── Bouton preview ── */
.ai-preview-btn {
    margin-right: auto;
    background: none;
    border: 1px solid #2a2a2a;
    color: #3a3a5a;
    font-size: 0.62rem;
    padding: 0.25rem 0.55rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: color 0.1s, border-color 0.1s;
}
.ai-preview-btn:hover:not(:disabled) { color: #9181f9; border-color: #4a3a8a; }
.ai-preview-btn:disabled { opacity: 0.3; cursor: default; }

/* ── Modal prompt complet ── */
.prompt-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}
.prompt-modal {
    background: #0c0c14;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    width: min(900px, 92vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.prompt-modal-header {
    display: flex;
    align-items: center;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid #1e1e2e;
    flex-shrink: 0;
}
.prompt-modal-title {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #555;
}
.prompt-modal-close {
    margin-left: auto;
    background: none;
    border: none;
    color: #333;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0 0.2rem;
    line-height: 1;
}
.prompt-modal-close:hover { color: #9181f9; }
.prompt-modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.67rem;
    color: #777;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.55;
    margin: 0;
}

/* ── Diagramme symboles ── */
.sym-diag {
    flex-shrink: 0;
    border-top: 1px solid #111;
    border-bottom: 1px solid #111;
    background: #06060e;
    max-height: 140px;
    overflow-y: auto;
}
.sym-diag::-webkit-scrollbar { width: 3px; }
.sym-diag::-webkit-scrollbar-thumb { background: #1a1a2a; border-radius: 2px; }
.sym-diag-header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.2rem 1rem;
    background: #07070f;
    border-bottom: 1px solid #111;
    position: sticky;
    top: 0;
    z-index: 1;
}
.sym-diag-label {
    font-size: 0.55rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #5a4aaa;
}
.sym-diag-hint {
    font-size: 0.55rem;
    color: #2a2a3a;
    font-style: italic;
}
.sym-diag-body {
    padding: 0.3rem 1rem 0.4rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
}
.sym-file {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 140px;
}
.sym-file-path {
    font-size: 0.58rem;
    color: #3a3a5a;
    letter-spacing: 0.03em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.sym-cls {
    padding-left: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
}
.sym-cls-name {
    font-size: 0.6rem;
    color: #7c6af7;
}
.sym-sig {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    padding-left: 0.75rem;
}
.sym-tree {
    font-size: 0.55rem;
    color: #2a2a3a;
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
}
.sym-sig-text {
    font-size: 0.58rem;
    color: #4a4a6a;
    font-family: 'JetBrains Mono', monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ── Séparateur ── */
.vhandle {
    flex-shrink: 0;
    height: 6px;
    cursor: row-resize;
    border-top: 1px solid #1e1e1e;
    border-bottom: 1px solid #1e1e1e;
    background: transparent;
    transition: border-color 0.15s;
}
.vhandle:hover, .vhandle.active { border-color: #3a3a3a; }

/* ── Contexte pane ── */
.ctx-pane {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
</style>
