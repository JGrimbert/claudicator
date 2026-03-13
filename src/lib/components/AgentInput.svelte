<script lang="ts">
    import { agentRunState, taskRefreshTick } from "$lib/stores/agent";
    import ContextViewer from "$lib/components/ContextViewer.svelte";

    type Task = { id: string; title: string };
    type SymbolGroup = { file?: string; sigs: string[] };
    type Section = { key: string; content: string };

    let { task, projectRoot = "" }: { task: Task; projectRoot?: string } = $props();

    // ── State ──────────────────────────────────────────────────────────────────
    let loadingContext = $state(false);
    let contextError   = $state("");
    let loadedId       = $state("");
    let symbolMap      = $state<Record<string, SymbolGroup>>({});
    let hasPlan        = $state(false);

    // Champs éditables (Row 1)
    let taskText = $state("");
    let descText = $state("");

    // Sections parsées (pour affichage read-only)
    let sections = $state<Section[]>([]);

    // ── Parsing ────────────────────────────────────────────────────────────────
    const TOP_KEYS = [
        'TASK', 'DESCRIPTION', 'OBJECTIF', 'CONTRAINTES',
        'FORMAT DU PLAN', 'DOCUMENTATION', 'ATLAS', 'CONCEPTS',
    ];
    const ENRICH_KEYS  = new Set(['OBJECTIF', 'CONTRAINTES', 'FORMAT DU PLAN', 'DOCUMENTATION', 'CONCEPTS']);
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
    let enrichSections = $derived(sections.filter(s => ENRICH_KEYS.has(s.key)));

    let atlasSubs = $derived.by(() => {
        const atlasSection = sections.find(s => s.key === 'ATLAS');
        if (!atlasSection?.content) return [];
        return parseByKeys(atlasSection.content, ATLAS_SUB_KEYS);
    });

    let hasAtlas   = $derived(sections.some(s => s.key === 'ATLAS'));
    let atlasRaw   = $derived(sections.find(s => s.key === 'ATLAS')?.content ?? '');

    let byFile = $derived.by(() => {
        const m = new Map<string, { cls: string; sigs: string[] }[]>();
        for (const [cls, group] of Object.entries(symbolMap)) {
            const file = group.file ?? "?";
            if (!m.has(file)) m.set(file, []);
            m.get(file)!.push({ cls, sigs: group.sigs });
        }
        return [...m.entries()];
    });

    // ── Assemblage prompt complet ──────────────────────────────────────────────
    function buildFullPrompt(): string {
        const parts: string[] = [];
        parts.push(`TASK\n${taskText.trim()}\n`);
        if (descText.trim()) parts.push(`\nDESCRIPTION\n${descText.trim()}\n`);
        for (const s of sections) {
            if (s.key !== 'TASK' && s.key !== 'DESCRIPTION') {
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
        hasPlan        = false;
        try {
            const planRes  = await fetch(`/api/tasks/${taskId}/plan`);
            const planData = await planRes.json();
            if (planData.content) {
                taskText  = planData.content;
                descText  = "";
                sections  = [];
                hasPlan   = true;
                symbolMap = {};
                return;
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
                sections     = [];
                taskText     = task.title;
                descText     = "";
                symbolMap    = {};
            } else {
                const parsed = parseByKeys(data.prompt ?? task.title, TOP_KEYS);
                sections     = parsed;
                taskText     = parsed.find(s => s.key === 'TASK')?.content ?? task.title;
                descText     = parsed.find(s => s.key === 'DESCRIPTION')?.content ?? "";
                symbolMap    = data.symbolMap ?? {};
            }
        } catch (e: any) {
            contextError = e.message;
            sections     = [];
            taskText     = task.title;
            descText     = "";
            symbolMap    = {};
        } finally {
            loadingContext = false;
        }
    }

    // ── Lancement ──────────────────────────────────────────────────────────────
    async function launch() {
        const text = (hasPlan ? taskText : buildFullPrompt()).trim();
        if (!text || $agentRunState.running) return;

        agentRunState.set({ taskId: task.id, taskTitle: task.title, logs: [], running: true });
        try {
            const res = await fetch("/api/agent/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: text, taskId: task.id, projectRoot: projectRoot || undefined }),
            });
            if (!res.ok || !res.body) {
                agentRunState.update(s => ({
                    ...s, running: false,
                    logs: [...s.logs, { line: `[erreur HTTP ${res.status}]`, type: "system" }],
                }));
                return;
            }
            const reader = res.body.getReader();
            const dec    = new TextDecoder();
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

    // ── Split redimensionnable ─────────────────────────────────────────────────
    const SPLIT_KEY    = "claudicator:agent-input-split";
    let splitPct       = $state(55);
    let splitEl: HTMLElement | null = null;
    let dragging       = $state(false);
    let dragStartY     = 0;
    let dragStartPct   = 55;

    $effect(() => {
        try {
            const v = Number(localStorage.getItem(SPLIT_KEY));
            if (!isNaN(v) && v >= 20 && v <= 85) splitPct = v;
        } catch { /* ignore */ }
    });

    function startDrag(e: MouseEvent) {
        dragging     = true;
        dragStartY   = e.clientY;
        dragStartPct = splitPct;
        e.preventDefault();
    }
    function onMove(e: MouseEvent) {
        if (!dragging || !splitEl) return;
        const h     = splitEl.offsetHeight;
        const delta = ((e.clientY - dragStartY) / h) * 100;
        splitPct    = Math.max(20, Math.min(85, dragStartPct + delta));
    }
    function onUp() {
        if (!dragging) return;
        dragging = false;
        try { localStorage.setItem(SPLIT_KEY, String(splitPct)); } catch { /* ignore */ }
    }
</script>

<svelte:window onmousemove={onMove} onmouseup={onUp} />

<div class="agent-input" bind:this={splitEl} class:dragging>

    <!-- ── Prompt pane ── -->
    <div class="prompt-pane" style="height: {splitPct}%">

        <div class="ai-header">
            <span class="ai-label">Prompt agent</span>
            {#if loadingContext}
                <span class="ai-hint">Chargement…</span>
            {:else if contextError}
                <span class="ai-hint err" title={contextError}>Contexte indisponible</span>
            {:else if hasPlan}
                <span class="ai-hint plan">Plan chargé</span>
            {:else}
                <span class="ai-hint">TASK · DESCRIPTION éditables</span>
            {/if}
            <button
                class="ai-reload"
                onclick={() => { loadedId = ""; loadContext(task.id); }}
                disabled={loadingContext}
                title="Regénérer le contexte"
            >↺</button>
        </div>

        <!-- Corps scrollable -->
        <div class="prompt-body">

            {#if hasPlan}
                <!-- Mode plan : textarea unique -->
                <textarea
                    class="ai-textarea plan-textarea"
                    bind:value={taskText}
                    placeholder="Contenu du plan…"
                    disabled={loadingContext}
                ></textarea>

            {:else}
                <!-- ── Row 1 : Input utilisateur (éditable) ── -->
                <div class="prompt-row row-input">
                    <span class="row-badge">INPUT</span>

                    <div class="field-group">
                        <span class="field-key">TASK</span>
                        <textarea
                            class="field-ta"
                            bind:value={taskText}
                            placeholder={loadingContext ? "Génération…" : "Titre de la tâche…"}
                            disabled={loadingContext}
                            rows="2"
                        ></textarea>
                    </div>

                    <div class="field-group">
                        <span class="field-key">DESCRIPTION</span>
                        <textarea
                            class="field-ta"
                            bind:value={descText}
                            placeholder="Description optionnelle…"
                            disabled={loadingContext}
                            rows="3"
                        ></textarea>
                    </div>
                </div>

                <!-- ── Row 2 : Enrichissement (read-only) ── -->
                {#if enrichSections.length > 0}
                    <div class="prompt-row row-enrich">
                        <span class="row-badge">ENRICHISSEMENT</span>
                        <div class="ro-grid">
                            {#each enrichSections as s}
                                <div class="ro-block">
                                    <div class="ro-key">{s.key}</div>
                                    <pre class="ro-pre">{s.content}</pre>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- ── Row 3 : Atlas (read-only) ── -->
                {#if hasAtlas}
                    <div class="prompt-row row-atlas">
                        <span class="row-badge">ATLAS</span>
                        {#if atlasSubs.length > 0}
                            <div class="atlas-grid">
                                {#each atlasSubs as sub}
                                    <div class="atlas-block">
                                        <div class="ro-key">{sub.key}</div>
                                        <pre class="ro-pre atlas-pre">{sub.content}</pre>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <pre class="ro-pre">{atlasRaw}</pre>
                        {/if}
                    </div>
                {/if}

                <!-- Symboles principaux -->
                {#if byFile.length > 0}
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

            {/if}
        </div><!-- /prompt-body -->

        <div class="ai-footer">
            <button
                class="ai-launch"
                onclick={launch}
                disabled={!taskText.trim() || $agentRunState.running || loadingContext}
            >
                {#if $agentRunState.running}
                    En cours…
                {:else}
                    <span class="ai-launch-label">Lancer l'agent</span><span class="ai-launch-arrow"> →</span>
                {/if}
            </button>
        </div>

    </div><!-- /prompt-pane -->

    <!-- ── Séparateur ── -->
    <div
        class="vhandle"
        role="separator"
        aria-label="Redimensionner prompt / contexte carto"
        onmousedown={startDrag}
        class:active={dragging}
    ></div>

    <!-- ── Contexte carto ── -->
    <div class="ctx-pane">
        <ContextViewer taskId={task.id} />
    </div>

</div>

<style>
.agent-input {
    display: flex;
    flex-direction: column;
    height: 100%;
    border-top: 1px solid var(--border);
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
    border-bottom: 1px solid var(--border);
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

/* ── Corps scrollable ── */
.prompt-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}
.prompt-body::-webkit-scrollbar { width: 3px; }
.prompt-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* ── Plan mode ── */
.plan-textarea {
    flex: 1;
    min-height: 0;
    background: var(--bg-deep);
    border: none;
    color: #777;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.67rem;
    line-height: 1.55;
    padding: 0.5rem 1rem;
    resize: none;
    outline: none;
}
.plan-textarea:focus { color: #bbb; }
.plan-textarea:disabled { opacity: 0.5; cursor: wait; }

/* ── Rows avec border pointillée ── */
.prompt-row {
    position: relative;
    margin: 0.55rem 0.7rem 0;
    border: 1px dashed var(--border);
    border-radius: 3px;
    padding: 0.6rem 0.65rem 0.5rem;
    flex-shrink: 0;
}
.prompt-row:last-of-type { margin-bottom: 0.55rem; }

/* Badge flottant sur la bordure */
.row-badge {
    position: absolute;
    top: -0.48em;
    left: 0.55rem;
    background: var(--bg-deep);
    font-size: 0.46rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    padding: 0 0.3rem;
    line-height: 1;
}
.row-input  .row-badge { color: #7c6af7; }
.row-enrich .row-badge { color: #4a7a5a; }
.row-atlas  .row-badge { color: #7a6a3a; }

/* ── Row 1 : champs éditables ── */
.field-group {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-bottom: 0.4rem;
}
.field-group:last-child { margin-bottom: 0; }
.field-key {
    font-size: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #4a4a6a;
    font-family: 'JetBrains Mono', monospace;
}
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

/* ── Row 2 : enrichissement ── */
.ro-grid {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
}
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

/* ── Row 3 : atlas ── */
.atlas-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.5rem 0.8rem;
}
.atlas-block { display: flex; flex-direction: column; gap: 0.1rem; }
.atlas-pre {
    max-height: 90px;
    color: #3a4a3a;
}

/* ── Symboles principaux ── */
.sym-diag {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background: var(--bg-deep);
    max-height: 130px;
    overflow-y: auto;
    margin-top: auto;
}
.sym-diag::-webkit-scrollbar { width: 3px; }
.sym-diag::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.sym-diag-header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.2rem 1rem;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
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
.sym-cls-name { font-size: 0.6rem; color: #7c6af7; }
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

/* ── Footer ── */
.ai-footer {
    display: flex;
    justify-content: flex-end;
    padding: 0.4rem 1rem;
    flex-shrink: 0;
    border-top: 1px solid var(--border);
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

/* ── Séparateur ── */
.vhandle {
    flex-shrink: 0;
    height: 6px;
    cursor: row-resize;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    background: transparent;
    transition: border-color 0.15s;
}
.vhandle:hover, .vhandle.active { border-color: var(--border-strong); }

/* ── Contexte pane ── */
.ctx-pane {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
</style>
