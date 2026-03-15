<script lang="ts">
    import type { Snippet } from 'svelte';
    import { agentRunState, taskRefreshTick, startConsoleStream } from "$lib/stores/agent";

    type Task = { id: string; title: string; issueNumber?: number };
    type Section = { key: string; content: string };

    let {
        task,
        projectRoot = "",
        mode = "spec",
        footerExtra,
        onBeforeLaunch,
        onLaunchComplete,
    }: {
        task: Task;
        projectRoot?: string;
        mode?: "spec" | "impl";
        footerExtra?: Snippet;
        onBeforeLaunch?: () => Promise<boolean>;
        onLaunchComplete?: () => void;
    } = $props();

    // ── State ──────────────────────────────────────────────────────────────────
    let loadingContext = $state(false);
    let contextError   = $state("");
    let loadedId       = $state("");
    let preLaunching   = $state(false);

    let taskText  = $state("");
    let planMode  = $state(true);
    let docMode   = $state(true);
    let atlasMode = $state(true);
    let hasPlan   = $state(false);
    let sections  = $state<Section[]>([]);
    let collapsed = $state(new Set<string>());

    function toggleSec(name: string) {
        const next = new Set(collapsed);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        collapsed = next;
    }

    // ── Parsing ────────────────────────────────────────────────────────────────
    const TOP_KEYS = [
        'TASK', 'DESCRIPTION', 'OBJECTIF', 'CONTRAINTES',
        'FORMAT DU PLAN', 'DOCUMENTATION', 'ATLAS', 'CONCEPTS',
    ];
    const PLAN_KEYS      = new Set(['OBJECTIF', 'CONTRAINTES', 'FORMAT DU PLAN']);
    const DOC_KEYS       = new Set(['DOCUMENTATION', 'CONCEPTS']);
    const ATLAS_SUB_KEYS = ['SYSTEM', 'MODULES', 'API ROUTES', 'DÉPENDANCES'];

    function parseByKeys(text: string, keys: string[]): Section[] {
        const result: Section[] = [];
        let currentKey = '';
        let currentContent: string[] = [];
        for (const line of text.split('\n')) {
            if (keys.includes(line.trim())) {
                if (currentKey) result.push({ key: currentKey, content: currentContent.join('\n').trim() });
                currentKey = line.trim();
                currentContent = [];
            } else {
                currentContent.push(line);
            }
        }
        if (currentKey) result.push({ key: currentKey, content: currentContent.join('\n').trim() });
        return result;
    }

    // ── Dérivés ────────────────────────────────────────────────────────────────
    let planSections = $derived(sections.filter(s => PLAN_KEYS.has(s.key)));
    let docSections  = $derived(sections.filter(s => DOC_KEYS.has(s.key)));

    let atlasSubs = $derived.by(() => {
        const atlasSection = sections.find(s => s.key === 'ATLAS');
        if (!atlasSection?.content) return [];
        return parseByKeys(atlasSection.content, ATLAS_SUB_KEYS);
    });

    let hasAtlas = $derived(sections.some(s => s.key === 'ATLAS'));
    let atlasRaw = $derived(sections.find(s => s.key === 'ATLAS')?.content ?? '');

    // ── Assemblage prompt complet ──────────────────────────────────────────────
    function buildFullPrompt(): string {
        const parts: string[] = [];
        parts.push(`TASK\n${taskText.trim()}\n`);
        const skipKeys = new Set([
            'TASK', 'DESCRIPTION',
            ...(planMode  ? [] : ['OBJECTIF', 'CONTRAINTES', 'FORMAT DU PLAN']),
            ...(docMode   ? [] : ['DOCUMENTATION', 'CONCEPTS']),
            ...(atlasMode ? [] : ['ATLAS']),
        ]);
        for (const s of sections) {
            if (!skipKeys.has(s.key)) {
                parts.push(`\n${s.key}\n${s.content}\n`);
            }
        }
        return parts.join('');
    }

    // ── Chargement du contexte ─────────────────────────────────────────────────
    $effect(() => {
        const id = task?.id ?? "";
        if (!id || id === loadedId) return;
        loadedId = id;
        loadContext(id);
    });

    async function loadContext(taskId: string) {
        loadingContext = true;
        contextError   = "";
        taskText       = "";
        sections       = [];
        hasPlan        = false;
        try {
            const planRes  = await fetch(`/api/tasks/${taskId}/plan`);
            const planData = await planRes.json();
            if (planData.content) {
                taskText = planData.content;
                hasPlan  = true;
            }

            const res  = await fetch("/api/context", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId, projectRoot: projectRoot || undefined }),
                signal: AbortSignal.timeout(15000),
            });
            const data = await res.json();
            if (data.error) {
                contextError = data.error;
                if (!taskText) taskText = task.title;
            } else {
                const parsed = parseByKeys(data.prompt ?? task.title, TOP_KEYS);
                sections = parsed;
                if (!taskText) {
                    const taskContent = parsed.find(s => s.key === 'TASK')?.content ?? task.title;
                    const descContent = parsed.find(s => s.key === 'DESCRIPTION')?.content ?? "";
                    taskText = descContent ? `${taskContent}\n\n${descContent}` : taskContent;
                }
            }
        } catch (e: any) {
            contextError = e.message;
            if (!taskText) taskText = task.title;
        } finally {
            loadingContext = false;
        }
    }

    // ── Lancement ──────────────────────────────────────────────────────────────
    async function launch() {
        const text = mode === "impl" ? taskText.trim() : buildFullPrompt().trim();
        if (!text || $agentRunState.running || preLaunching) return;

        if (onBeforeLaunch) {
            preLaunching = true;
            try {
                const ok = await onBeforeLaunch();
                if (!ok) return;
            } finally {
                preLaunching = false;
            }
        }

        agentRunState.set({ taskId: task.id, taskTitle: task.title, logs: [], running: true, sessionAlive: false, consoleMinimized: false });
        try {
            const body = mode === "impl"
                ? { plan: text, taskId: task.id }
                : { prompt: text, taskId: task.id, projectRoot: projectRoot || undefined };
            const res = await fetch("/api/agent/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            await startConsoleStream(res);
        } finally {
            agentRunState.update(s => ({ ...s, running: false }));
            taskRefreshTick.update(n => n + 1);
            onLaunchComplete?.();
        }
    }

</script>

<div class="agent-input">

    <div class="prompt-pane">

        <div class="ai-header">
            <span class="ai-label">
                {#if task.issueNumber}<span class="ai-issue">#{task.issueNumber}</span>{/if}
                {task.title}
            </span>
            {#if loadingContext}
                <span class="ai-hint">Chargement…</span>
            {:else if contextError}
                <span class="ai-hint err" title={contextError}>Contexte indisponible</span>
            {:else if mode === "impl"}
                <span class="ai-hint plan">impl</span>
            {:else}
                <span class="ai-hint">spec</span>
            {/if}
            <button
                class="ai-reload"
                onclick={() => { loadedId = ""; loadContext(task.id); }}
                disabled={loadingContext}
                title="Regénérer le contexte"
            >↺</button>
        </div>

        <!-- Corps document unifié -->
        <div class="doc-scroll">

            <!-- Section INPUT — pas de toggle -->
            <div class="doc-sec sec-input">
                {#if hasPlan}
                    <pre class="plan-md">{taskText}</pre>
                {:else}
                    <textarea
                        class="field-ta"
                        bind:value={taskText}
                        placeholder={loadingContext ? "Génération…" : "Tâche…"}
                        disabled={loadingContext}
                        rows="4"
                    ></textarea>
                {/if}
            </div>

            <!-- Section PLAN — toggleable -->
            {#if planMode && planSections.length > 0}
                <div class="doc-sec">
                    <button class="sec-toggle" onclick={() => toggleSec('plan')}>
                        plan {collapsed.has('plan') ? '▸' : '▾'}
                    </button>
                    {#if !collapsed.has('plan')}
                        <div class="sec-body">
                            {#each planSections as s}
                                <div class="ro-block">
                                    <div class="ro-key">{s.key}</div>
                                    <pre class="ro-pre">{s.content}</pre>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Section DOCUMENTATION — toggleable -->
            {#if docMode && docSections.length > 0}
                <div class="doc-sec">
                    <button class="sec-toggle" onclick={() => toggleSec('doc')}>
                        documentation {collapsed.has('doc') ? '▸' : '▾'}
                    </button>
                    {#if !collapsed.has('doc')}
                        <div class="sec-body">
                            {#each docSections as s}
                                <div class="ro-block">
                                    <div class="ro-key">{s.key}</div>
                                    <pre class="ro-pre">{s.content}</pre>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Section ATLAS — toggleable -->
            {#if atlasMode && hasAtlas}
                <div class="doc-sec">
                    <button class="sec-toggle" onclick={() => toggleSec('atlas')}>
                        atlas {collapsed.has('atlas') ? '▸' : '▾'}
                    </button>
                    {#if !collapsed.has('atlas')}
                        <div class="sec-body">
                            {#if atlasSubs.length > 0}
                                <div class="atlas-grid">
                                    {#each atlasSubs as sub}
                                        <div class="atlas-block">
                                            <div class="ro-key">{sub.key}</div>
                                            <pre class="ro-pre">{sub.content}</pre>
                                        </div>
                                    {/each}
                                </div>
                            {:else}
                                <pre class="ro-pre">{atlasRaw}</pre>
                            {/if}
                        </div>
                    {/if}
                </div>
            {/if}

        </div><!-- /doc-scroll -->

        <div class="ai-footer">
            <label class="plan-toggle-row">
                <span class="plan-toggle-label">plan</span>
                <span class="plan-toggle-track" class:on={planMode}>
                    <span class="plan-toggle-thumb"></span>
                </span>
                <input type="checkbox" bind:checked={planMode} hidden />
            </label>
            {#if docSections.length > 0}
                <label class="plan-toggle-row">
                    <span class="plan-toggle-label">docs</span>
                    <span class="plan-toggle-track" class:on={docMode}>
                        <span class="plan-toggle-thumb"></span>
                    </span>
                    <input type="checkbox" bind:checked={docMode} hidden />
                </label>
            {/if}
            {#if hasAtlas}
                <label class="plan-toggle-row">
                    <span class="plan-toggle-label">atlas</span>
                    <span class="plan-toggle-track" class:on={atlasMode}>
                        <span class="plan-toggle-thumb"></span>
                    </span>
                    <input type="checkbox" bind:checked={atlasMode} hidden />
                </label>
            {/if}
            {@render footerExtra?.()}
            <button
                class="ai-launch"
                onclick={launch}
                disabled={!taskText.trim() || $agentRunState.running || loadingContext || preLaunching}
            >
                {#if $agentRunState.running || preLaunching}
                    En cours…
                {:else}
                    <span class="ai-launch-label">Lancer l'agent</span><span class="ai-launch-arrow"> →</span>
                {/if}
            </button>
        </div>

    </div><!-- /prompt-pane -->

</div>

<style>
.agent-input {
    display: flex;
    flex-direction: column;
    height: 100%;
    border-top: 1px solid var(--border);
}

/* ── Prompt pane ── */
.prompt-pane {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}
.ai-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}
.ai-label {
    font-size: 0.6rem;
    color: #555;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
}
.ai-issue {
    color: #7c6af7;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.55rem;
    margin-right: 0.3rem;
}
.ai-hint {
    font-size: 0.6rem;
    color: #2a2a2a;
    font-style: italic;
}
.ai-hint.err  { color: #7a2a2a; }
.ai-hint.plan { color: #4a7a4a; }
.ai-reload {
    background: none;
    flex-shrink: 0;
    border: none;
    color: #2a2a2a;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0 0.2rem;
    line-height: 1;
}
.ai-reload:hover:not(:disabled) { color: #7c6af7; }
.ai-reload:disabled { opacity: 0.3; cursor: default; }

/* ── Document scrollable ── */
.doc-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}
.doc-scroll::-webkit-scrollbar { width: 3px; }
.doc-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* ── Sections ── */
.doc-sec {
    display: flex;
    flex-direction: column;
    padding: 0.4rem 0.7rem 0;
    flex-shrink: 0;
}
.sec-input { padding-top: 0.5rem; }

.sec-toggle {
    background: none;
    border: none;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.46rem;
    color: #333;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    text-align: left;
    padding: 0.25rem 0;
    width: 100%;
}
.sec-toggle:hover { color: #666; }

.sec-body {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-bottom: 0.2rem;
}

/* ── Plan rendu (hasPlan) ── */
.plan-md {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.67rem;
    color: #888;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    padding: 0.1rem 0;
}

/* ── Textarea éditable ── */
.field-ta {
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 2px;
    color: #999;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.67rem;
    line-height: 1.55;
    padding: 0.3rem 0.5rem;
    resize: vertical;
    outline: none;
    width: 100%;
    box-sizing: border-box;
}
.field-ta:focus { color: #ccc; border-color: var(--border-strong); }
.field-ta:disabled { opacity: 0.45; cursor: wait; }
.field-ta::placeholder { color: var(--border-strong); }

/* ── Blocs read-only ── */
.ro-block { display: flex; flex-direction: column; gap: 0.1rem; }
.ro-key {
    font-size: 0.48rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #3a4a3a;
    font-family: 'JetBrains Mono', monospace;
}
.ro-pre {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    color: #3a3a4a;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    max-height: 72px;
    overflow-y: auto;
}
.ro-pre::-webkit-scrollbar { width: 2px; }
.ro-pre::-webkit-scrollbar-thumb { background: var(--border); }

/* ── Atlas grid ── */
.atlas-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.5rem 0.8rem;
}
.atlas-block { display: flex; flex-direction: column; gap: 0.1rem; }

/* ── Footer ── */
.ai-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.4rem;
    padding: 0.4rem 1rem;
    flex-shrink: 0;
    border-top: 1px solid var(--border);
}

/* ── Toggle plan (dans footer) ── */
.plan-toggle-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
    user-select: none;
    margin-right: auto;
}
.plan-toggle-label {
    font-size: 0.46rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #4a4a6a;
    font-family: 'JetBrains Mono', monospace;
}
.plan-toggle-track {
    display: inline-flex;
    align-items: center;
    width: 22px;
    height: 11px;
    border-radius: 6px;
    background: var(--border);
    border: 1px solid var(--border);
    transition: background 0.15s, border-color 0.15s;
    position: relative;
    flex-shrink: 0;
}
.plan-toggle-track.on {
    background: #1e1540;
    border-color: #3a2e70;
}
.plan-toggle-thumb {
    position: absolute;
    left: 1px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #666;
    transition: left 0.15s, background 0.15s;
}
.plan-toggle-track.on .plan-toggle-thumb {
    left: 12px;
    background: #9a8ad4;
}

.ai-launch {
    background: #1e1540;
    border: 1px solid #3a2e70;
    border-radius: 3px;
    font-size: 0.65rem;
    padding: 0.3rem 0.9rem;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    letter-spacing: 0.03em;
    display: inline-flex;
    align-items: center;
}
.ai-launch-label { color: var(--color-impl); }
.ai-launch-arrow { color: #fff; }
.ai-launch:hover:not(:disabled) { background: #2a1e58; border-color: #5a4a9a; }
.ai-launch:disabled { opacity: 0.35; cursor: default; }

</style>
