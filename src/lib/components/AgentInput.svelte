<script lang="ts">
    import type { Snippet } from 'svelte';
    import { get } from "svelte/store";
    import { agentRunState, taskRefreshTick, startConsoleStream, consoleTab } from "$lib/stores/agent";
    import { JgrCta, JgrPre } from 'jgr-ui';

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

    let taskText    = $state("");
    let refineText  = $state("");
    let planMode    = $state(true);
    let docMode     = $state(false);
    let atlasMode   = $state(false);
    let hasPlan     = $state(false);
    let sections    = $state<Section[]>([]);
    let collapsed   = $state(new Set<string>());
    let editingPlan = $state(false);
    let editText    = $state("");
    let savingPlan  = $state(false);

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
        if (refineText.trim()) {
            parts.push(`\nRAFFINEMENT\n${refineText.trim()}\n`);
        }
        return parts.join('');
    }

    // ── Édition du plan ────────────────────────────────────────────────────────
    function startEditPlan() {
        editText = taskText;
        editingPlan = true;
    }

    function cancelEditPlan() {
        editingPlan = false;
        editText = "";
    }

    async function savePlan() {
        if (!editText.trim() || savingPlan) return;
        savingPlan = true;
        try {
            const res = await fetch(`/api/tasks/${task.id}/plan`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: editText }),
            });
            if (res.ok) {
                taskText = editText;
                editingPlan = false;
                editText = "";
            }
        } finally {
            savingPlan = false;
        }
    }

    // ── Reset refineText à chaque nouvelle task ────────────────────────────────
    $effect(() => {
        const id = task?.id ?? "";
        if (!id || id === loadedId) return;
        refineText = "";
        editingPlan = false;
    });

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

    // ── Rechargement plan post-run ─────────────────────────────────────────────
    async function reloadPlan(taskId: string) {
        const res = await fetch(`/api/tasks/${taskId}/plan`);
        const data = await res.json();
        if (data.content) {
            taskText = data.content;
            hasPlan = true;
        }
    }

    $effect(() => {
        const tick = $taskRefreshTick;
        const runTaskId = $agentRunState.taskId;
        if (tick === 0) return;
        if (!runTaskId || runTaskId !== task?.id) return;
        reloadPlan(task.id);
    });

    // ── Lancement ──────────────────────────────────────────────────────────────
    async function launch() {
        // hasPlan → session impl ; sinon → one-shot spec (plus fiable sur Windows)
        let text: string;
        if (hasPlan) {
            const base = taskText.trim();
            text = refineText.trim() ? `${base}\n\nRAFFINEMENT\n${refineText.trim()}` : base;
        } else {
            text = buildFullPrompt().trim();
        }
        if (!text || $agentRunState.running || preLaunching) return;

        if ($agentRunState.sessionAlive) {
            const ok = confirm("Une session est active dans la console. L'interrompre pour lancer ce prompt ?");
            if (!ok) return;
            // Tuer la session côté serveur pour éviter le 409
            await fetch("/api/agent/session", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId: task.id }),
            });
        }

        if (onBeforeLaunch) {
            preLaunching = true;
            try {
                const ok = await onBeforeLaunch();
                if (!ok) return;
            } finally {
                preLaunching = false;
            }
        }

        consoleTab.set("console");
        agentRunState.set({ taskId: task.id, taskTitle: task.title, logs: [], running: true, sessionAlive: false, consoleMinimized: false, completionLabel: null });
        const body = hasPlan
            ? { plan: text, taskId: task.id }
            : { prompt: text, taskId: task.id, projectRoot: projectRoot || undefined };
        try {
            let res = await fetch("/api/agent/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            // Si 409 : session encore occupée côté serveur (coupure SSE en cours de tour)
            if (res.status === 409) {
                agentRunState.update(s => ({ ...s, running: false }));
                const ok = confirm("Claude est encore actif sur cette tâche. L'interrompre pour relancer ?");
                if (!ok) return;
                await fetch("/api/agent/session", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ taskId: task.id }),
                });
                agentRunState.update(s => ({ ...s, running: true }));
                res = await fetch("/api/agent/run", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
            }
            await startConsoleStream(res);
            // Fallback : si l'event session_status SSE a été manqué (chunk boundary), vérifier côté serveur
            if (hasPlan && !get(agentRunState).sessionAlive) {
                try {
                    const r = await fetch(`/api/agent/session?taskId=${encodeURIComponent(task.id)}`);
                    if (r.ok) {
                        const d = await r.json() as { alive: boolean };
                        if (d.alive) agentRunState.update(s => ({ ...s, sessionAlive: true }));
                    }
                } catch { /* silencieux */ }
            }
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
                    {#if editingPlan}
                        <textarea
                            class="field-ta plan-edit-ta"
                            bind:value={editText}
                            disabled={savingPlan}
                            rows="12"
                        ></textarea>
                        <div class="plan-edit-actions">
                            <button class="plan-save-btn" onclick={savePlan} disabled={savingPlan || !editText.trim()}>
                                {savingPlan ? "…" : "✓ Sauvegarder"}
                            </button>
                            <button class="plan-cancel-btn" onclick={cancelEditPlan} disabled={savingPlan}>
                                ✕ Annuler
                            </button>
                        </div>
                    {:else}
                        <div class="plan-preview-row">
                            <div class="plan-preview-content">
                                <JgrPre content={taskText} previewLines={5} maxHeight="14rem" />
                            </div>
                            <button class="plan-edit-btn" onclick={startEditPlan} title="Modifier le plan">✎</button>
                        </div>
                        <textarea
                            class="field-ta refine-ta"
                            bind:value={refineText}
                            placeholder="Refinement… (Entrée pour lancer)"
                            rows="3"
                            onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); launch(); } }}
                        ></textarea>
                    {/if}
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

            <!-- Toggles PLAN / DOCS / ATLAS — empilés -->
            {#if planSections.length > 0 || docSections.length > 0 || hasAtlas}
                <div class="doc-sec sec-toggles">
                    {#if planSections.length > 0}
                        <label class="plan-toggle-row">
                            <span class="plan-toggle-label">plan</span>
                            <span class="plan-toggle-track" class:on={planMode}>
                                <span class="plan-toggle-thumb"></span>
                            </span>
                            <input type="checkbox" bind:checked={planMode} hidden />
                        </label>
                    {/if}
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
                </div>
            {/if}

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
                                    <JgrPre content={s.content} previewLines={5} maxHeight="10rem" />
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
            {@render footerExtra?.()}
            <JgrCta
                label={hasPlan ? "Implémenter" : "Lancer l'agent"}
                pending={$agentRunState.running || preLaunching}
                disabled={!taskText.trim() || loadingContext}
                onclick={launch}
            />
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
.sec-toggles {
    padding-top: 0.4rem;
    padding-bottom: 0.1rem;
    gap: 0.3rem;
}

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

/* ── Textarea refinement ── */
.refine-ta {
    margin-top: 0.4rem;
    border-color: #2a2a4a;
    rows: 3;
}
.refine-ta:focus { border-color: var(--accent); color: #ccc; }
.refine-ta::placeholder { color: #2a2a3a; font-style: italic; }

/* ── Édition plan ── */
.plan-preview-row {
    display: flex;
    align-items: flex-start;
    gap: 0.3rem;
}
.plan-preview-content { flex: 1; min-width: 0; }
.plan-edit-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: #555;
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0.15rem 0.35rem;
    flex-shrink: 0;
    line-height: 1;
    margin-top: 0.1rem;
}
.plan-edit-btn:hover { color: #9a8ad4; border-color: #3a2e70; }
.plan-edit-ta {
    min-height: 12rem;
    resize: vertical;
}
.plan-edit-actions {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.3rem;
}
.plan-save-btn, .plan-cancel-btn {
    border: none;
    border-radius: 2px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    cursor: pointer;
    padding: 0.25rem 0.6rem;
}
.plan-save-btn {
    background: #1e1540;
    color: #9a8ad4;
    border: 1px solid #3a2e70;
}
.plan-save-btn:hover:not(:disabled) { background: #2a1e58; }
.plan-save-btn:disabled { opacity: 0.4; cursor: default; }
.plan-cancel-btn {
    background: none;
    color: #555;
    border: 1px solid var(--border);
}
.plan-cancel-btn:hover:not(:disabled) { color: #999; }
.plan-cancel-btn:disabled { opacity: 0.4; cursor: default; }

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
}

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


</style>
