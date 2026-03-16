<script lang="ts">
    import { onMount } from 'svelte';
    import { agentState, notifyTaskCreated, taskIssueNumbers, issueListRefreshTick } from "$lib/stores/agent";
    import type { SymbolEntry } from "$lib/types/symbols";
    import { JgrBtn } from 'jgr-ui';

    // ─── Plan ─────────────────────────────────────────────────────────────────
    let prevIssue = 0;
    let prevBodyLoaded = false;

    $: {
        const _issue = $agentState.issue;
        if (_issue?.number) {
            const bodyLoaded = !!(_issue.body);
            if (_issue.number !== prevIssue) {
                prevIssue = _issue.number;
                prevBodyLoaded = bodyLoaded;
                loadPlan(_issue.number);
                loadSymbols(_issue.title, _issue.body ?? '');
            } else if (bodyLoaded && !prevBodyLoaded) {
                prevBodyLoaded = true;
                loadSymbols(_issue.title, _issue.body ?? '');
            }
        }
    }

    // ─── Symboles ─────────────────────────────────────────────────────────────
    let symbols: SymbolEntry[] = [];
    let symbolsLoading = false;

    /** Mots significatifs (≥ 3 chars) */
    function keywords(text: string): string[] {
        return text.toLowerCase()
            .split(/[\s\n\r\\\/.,;:!?()\[\]{}#*`|]+/)
            .filter(w => w.length >= 3);
    }

    async function loadSymbols(title: string, body: string) {
        symbolsLoading = true;
        symbols = [];

        const queryText = [title, body].filter(Boolean).join('\n').slice(0, 500);
        const kws = keywords(queryText);

        try {
            // ── 1. Recherche sémantique (méthodes indexées) ──────────────────
            const cartoP = fetch('/api/cartography', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: queryText }),
            }).then(r => r.ok ? r.json() : {}).catch(() => ({}));

            // ── 2. Recherche par nom de fichier via atlas ─────────────────────
            const atlasP = fetch('/api/atlas')
                .then(r => r.ok ? r.json() : null).catch(() => null);

            const [carto, atlas] = await Promise.all([cartoP, atlasP]);

            const result: SymbolEntry[] = [];
            const seenKeys  = new Set<string>();
            const seenFiles = new Set<string>();

            // Résultats cartography
            for (const s of [...(carto.results ?? []), ...(carto.grepMethods ?? [])]) {
                if (seenKeys.has(s.key)) continue;
                seenKeys.add(s.key);
                seenFiles.add(s.file ?? '');
                result.push({
                    key: s.key, file: s.file ?? '',
                    startLine: s.startLine ?? null, score: s.score ?? null,
                    role: s.role ?? null, summary: s.summary ?? null,
                });
            }

            // Résultats atlas — fichiers dont le nom correspond aux mots-clés
            if (atlas?.regions && kws.length > 0) {
                for (const [region, rd] of Object.entries(atlas.regions) as [string, { files: string[] }][]) {
                    for (const filePath of (rd.files ?? [])) {
                        if (seenFiles.has(filePath)) continue;
                        const base = (filePath.split('/').pop() ?? '').replace(/\.[^.]+$/, '').toLowerCase();
                        if (!kws.some(kw => base.includes(kw) || kw.includes(base))) continue;
                        const key = (filePath.split('/').pop() ?? filePath).replace(/\.[^.]+$/, '');
                        // Ne pas bloquer via seenKeys — deux fichiers distincts peuvent avoir le même basename
                        seenFiles.add(filePath);
                        result.push({ key, file: filePath, startLine: null, score: null, role: region, summary: null });
                    }
                }
            }

            symbols = result;
        } catch { /* silencieux */ }
        finally { symbolsLoading = false; }
    }

    // ─── Clusters ─────────────────────────────────────────────────────────────
    type CoalSym = { key: string; dir: string };
    type ClusterDirItem  = { dir: string; symbols: { name: string; issues: number[] }[]; issues: number[]; count: number };
    type ClusterMixedItem = { dirs: string[]; symbols: { name: string; dir: string; issues: number[] }[]; issues: number[]; count: number };
    type ClusterCoalItem = { symbols: CoalSym[]; issues: number[]; score: number; count: number };
    type ClustersData    = { dirs: ClusterDirItem[]; mixed: ClusterMixedItem[]; coal: ClusterCoalItem[] };

    let clusterData: ClustersData | null = null;

    onMount(() => { loadClusters(); });

    async function loadClusters() {
        try {
            const res = await fetch('/api/clusters');
            if (res.ok) clusterData = await res.json();
        } catch {}
    }

    $: issueNum   = $agentState.issue?.number ?? 0;
    $: issueCoal  = (clusterData?.coal ?? [])
        .filter(c => c.issues.includes(issueNum))
        .map(c => [...new Set(c.symbols.map((s: CoalSym) => s.dir))].join(' / ') || '?');
    $: issueDirs  = (clusterData?.dirs ?? [])
        .filter(c => c.issues.includes(issueNum))
        .map(c => c.dir);
    $: issueMixed = (clusterData?.mixed ?? [])
        .filter(c => c.issues.includes(issueNum))
        .map(c => c.dirs.join(' + '));

    async function loadPlan(num: number) {
        const res  = await fetch(`/api/plan?issue=${num}`);
        const data = await res.json();
        agentState.update(s => ({
            ...s,
            plan:   data.exists ? data.content : null,
            status: data.exists ? "done" : "idle"
        }));
    }

    // ─── Navigation ───────────────────────────────────────────────────────────
    async function navigateToSubIssue(number: number) {
        const current = $agentState.issue;
        if (!current) return;

        agentState.update(s => ({
            ...s,
            navigationStack: [...s.navigationStack, current],
            status: "loading"
        }));

        const res = await fetch(`/api/issue?number=${number}`);
        const full = await res.json();

        agentState.update(s => ({
            ...s,
            issue: full,
            plan: null,
            status: "idle",
            knownSubIssueNumbers: [
                ...new Set([...s.knownSubIssueNumbers, ...(full.subIssues?.map((si: any) => si.number) ?? [])])
            ]
        }));
    }

    function navigateBack() {
        agentState.update(s => {
            const stack = [...s.navigationStack];
            const parent = stack.pop() ?? null;
            return { ...s, issue: parent, plan: null, status: "idle", navigationStack: stack };
        });
    }

    // ─── Édition inline ───────────────────────────────────────────────────────
    let editingTitle  = false;
    let editingBody   = false;
    let editTitle     = "";
    let editBody      = "";
    let saveError     = "";
    let saving        = false;

    // Réinitialiser l'édition au changement d'issue
    $: if ($agentState.issue?.number) {
        editingTitle = false;
        editingBody  = false;
        saveError    = "";
    }

    function startEditTitle() {
        editTitle    = $agentState.issue?.title ?? "";
        editingTitle = true;
        editingBody  = false;
    }
    function startEditBody() {
        editBody     = $agentState.issue?.body ?? "";
        editingBody  = true;
        editingTitle = false;
    }
    function cancelEdit() {
        editingTitle = false;
        editingBody  = false;
        saveError    = "";
    }
    async function save() {
        if (!$agentState.issue || saving) return;
        saving    = true;
        saveError = "";
        try {
            const res = await fetch("/api/issue", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    number: $agentState.issue.number,
                    ...(editingTitle ? { title: editTitle } : {}),
                    ...(editingBody  ? { body:  editBody  } : {}),
                })
            });
            const data = await res.json();
            if (data.error) { saveError = data.error; return; }
            agentState.update(s => ({
                ...s,
                issue: s.issue ? { ...s.issue, title: data.title, body: data.body } : s.issue
            }));
            editingTitle = false;
            editingBody  = false;
        } finally {
            saving = false;
        }
    }

    // ─── Création d'issue ─────────────────────────────────────────────────────
    let newTitle      = "";
    let newBody       = "";
    let createError   = "";
    let createLoading = false;

    async function submitCreate() {
        if (!newTitle.trim() || createLoading) return;
        createLoading = true;
        createError   = "";
        try {
            const res = await fetch("/api/issues", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: newTitle, body: newBody })
            });
            const data = await res.json();
            if (data.error) { createError = data.error; return; }
            newTitle = "";
            newBody  = "";
            agentState.update(s => ({
                ...s,
                issue: {
                    number: data.number,
                    title: data.title,
                    body: data.body ?? "",
                    state: "open",
                    subIssues: [],
                    created: new Date().toISOString(),
                    labels: []
                },
                status: "idle"
            }));
            issueListRefreshTick.update(n => n + 1);
        } catch (e: any) {
            createError = e.message;
        } finally {
            createLoading = false;
        }
    }

    // ─── Nouvelle issue ───────────────────────────────────────────────────────
    function openCreate() {
        newTitle = "";
        newBody = "";
        createError = "";
        agentState.update(s => ({ ...s, issue: null, plan: null, status: "idle", navigationStack: [] }));
    }

    // ─── Créer une task ───────────────────────────────────────────────────────
    let taskCreated = false;

    async function createTask() {
        const issue = $agentState.issue;
        if (!issue) return;
        const res = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: issue.title, issueNumber: issue.number }),
        });
        const created = await res.json();
        notifyTaskCreated(created?.id);
        taskCreated = true;
        setTimeout(() => { taskCreated = false; }, 2000);
    }
</script>

<div class="panel">
    <div class="panel-header">
        {#if $agentState.navigationStack.length > 0}
            <JgrBtn variant="back" onclick={navigateBack}>
                ← #{$agentState.navigationStack.at(-1)?.number}
            </JgrBtn>
        {/if}
        <span>Artefact</span>
        {#if editingTitle || editingBody}
            <div class="edit-actions">
                <button class="edit-btn edit-btn--confirm" onclick={save} disabled={saving} title="Valider">✓</button>
                <button class="edit-btn edit-btn--cancel"  onclick={cancelEdit} title="Annuler">✕</button>
            </div>
        {:else if !$agentState.issue && newTitle.trim()}
            <div class="edit-actions">
                <button class="edit-btn edit-btn--confirm" onclick={submitCreate} disabled={createLoading} title="Créer">✓</button>
                <button class="edit-btn edit-btn--cancel"  onclick={() => { newTitle = ""; newBody = ""; createError = ""; }} title="Vider">✕</button>
            </div>
        {:else}
            <div class="header-right">
                {#if $agentState.issue && !$taskIssueNumbers.has($agentState.issue.number)}
                    <button class="task-btn-top" onclick={createTask} disabled={taskCreated} title="Créer une task liée à cette issue">
                        {taskCreated ? "✓ créée" : "Task →"}
                    </button>
                {/if}
                <button class="new-issue-btn" onclick={openCreate} title="Créer une nouvelle issue">+ Issue</button>
            </div>
        {/if}
    </div>

    <div class="content">
        {#if $agentState.issue !== null}
            {#if $agentState.status === "loading" && !$agentState.issue.body}
                <p class="hint blink">Chargement...</p>
            {:else}
                <div class="issue-body">
                    <!-- Titre -->
                    {#if editingTitle}
                        <input class="edit-inline" bind:value={editTitle} />
                    {:else}
                        <h2 class="issue-title" onclick={startEditTitle}>
                            #{$agentState.issue.number} — {$agentState.issue.title}
                        </h2>
                    {/if}

                    <!-- Corps -->
                    {#if editingBody}
                        <textarea class="edit-inline edit-inline--body" bind:value={editBody}></textarea>
                    {:else}
                        <pre class="body-text" onclick={startEditBody}>{$agentState.issue.body}</pre>
                    {/if}

                    {#if saveError}<span class="save-error">{saveError}</span>{/if}

                    {#if $agentState.issue.subIssues?.length}
                        <div class="sub-issues">
                            <p class="sub-label">Sub-issues ({$agentState.issue.subIssues.length})</p>
                            <ul>
                                {#each $agentState.issue.subIssues as sub}
                                    <li class="sub-item" class:closed={sub.state === "closed"}>
                                        <span class="sub-check">{sub.state === "closed" ? "✓" : "○"}</span>
                                        <button class="sub-btn" onclick={() => navigateToSubIssue(sub.number)}>
                                            <span class="sub-num">#{sub.number}</span>
                                            <span class="sub-title">{sub.title}</span>
                                        </button>
                                    </li>
                                {/each}
                            </ul>
                        </div>
                    {/if}
                </div>

                {#if symbolsLoading || symbols.length > 0 || issueCoal.length > 0 || issueDirs.length > 0 || issueMixed.length > 0}
                    <div class="sym-tree">
                        <!-- SYMBOLES -->
                        <div class="sym-sec sym-sec--sym">
                            <div class="sym-group-hd">
                                <span class="sym-label">Symboles</span>
                                <span class="sym-state">{symbolsLoading ? '…' : symbols.length}</span>
                            </div>
                            {#each symbols as s ((s.file || '') + '|' + s.key)}
                                <div class="sym-row">
                                    <span class="sym-bullet">*</span>
                                    <span class="sym-key">{s.key}</span>
                                </div>
                            {/each}
                        </div>

                        <!-- COALESCENCE -->
                        {#if issueCoal.length > 0}
                            <div class="sym-sec sym-sec--coal">
                                <div class="sym-group-hd">
                                    <span class="sym-label">Coalescence</span>
                                    <span class="sym-state">{issueCoal.length}</span>
                                </div>
                                {#each issueCoal as name}
                                    <div class="sym-row">
                                        <span class="sym-bullet">*</span>
                                        <span class="sym-key">{name}</span>
                                    </div>
                                {/each}
                            </div>
                        {/if}

                        <!-- DIR -->
                        {#if issueDirs.length > 0}
                            <div class="sym-sec sym-sec--dir">
                                <div class="sym-group-hd">
                                    <span class="sym-label">Dir</span>
                                    <span class="sym-state">{issueDirs.length}</span>
                                </div>
                                {#each issueDirs as dir}
                                    <div class="sym-row">
                                        <span class="sym-bullet">*</span>
                                        <span class="sym-key">{dir}</span>
                                    </div>
                                {/each}
                            </div>
                        {/if}

                        <!-- MIXTE -->
                        {#if issueMixed.length > 0}
                            <div class="sym-sec sym-sec--mixte">
                                <div class="sym-group-hd">
                                    <span class="sym-label">Mixte</span>
                                    <span class="sym-state">{issueMixed.length}</span>
                                </div>
                                {#each issueMixed as pattern}
                                    <div class="sym-row">
                                        <span class="sym-bullet">*</span>
                                        <span class="sym-key">{pattern}</span>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/if}
            {/if}
        {:else}
            <div class="create-row">
                <input class="edit-inline" placeholder="Titre de l'issue…" bind:value={newTitle} disabled={createLoading} />
                <textarea class="edit-inline edit-inline--body" placeholder="Description…" bind:value={newBody} rows="4" disabled={createLoading}></textarea>
                {#if createError}<span class="save-error">{createError}</span>{/if}
            </div>
        {/if}
    </div>

    {#if $agentState.issue}
        <div class="plan-section">
            <div class="plan-header">
                <span class="plan-label">Plan — #{$agentState.issue.number}</span>
            </div>
            {#if $agentState.plan}
                <div class="plan-content">
                    <pre class="plan">{$agentState.plan}</pre>
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
.panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--border);
}
.panel-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg-panel);
    position: relative;
    z-index: 1;
}

.content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1rem;
}
.content::-webkit-scrollbar { width: 4px; }
.content::-webkit-scrollbar-track { background: transparent; }
.content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.content::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }
.plan-section {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    max-height: 40%;
}
.plan-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}
.plan-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #444;
}
.header-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
}
.task-btn-top {
    background: #1e1540;
    border: 1px solid #3a2e70;
    border-radius: 3px;
    color: cornsilk;
    font-size: 0.62rem;
    padding: 0.25rem 0.7rem;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    letter-spacing: 0.03em;
    flex-shrink: 0;
}
.task-btn-top:hover:not(:disabled) { background: #2a1e58; border-color: #5a4a9a; }
.task-btn-top:disabled { opacity: 0.4; cursor: default; }
.new-issue-btn {
    background: none;
    border: 1px solid var(--border-strong);
    border-radius: 3px;
    color: var(--text-muted);
    font-size: 0.62rem;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    letter-spacing: 0.03em;
    text-transform: none;
    flex-shrink: 0;
}
.new-issue-btn:hover { color: var(--text-primary); border-color: var(--accent); }
.plan-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem 1rem;
}
.plan-content::-webkit-scrollbar { width: 4px; }
.plan-content::-webkit-scrollbar-track { background: transparent; }
.plan-content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.plan {
    color: var(--text-primary);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    line-height: 1.6;
}
.issue-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
.issue-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.4;
}
.body-text {
    color: var(--text-secondary);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
    margin: 0;
}
.sub-issues {
    border-top: 1px solid var(--border);
    padding-top: 0.75rem;
}
.sub-label {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #444;
    margin-bottom: 0.4rem;
}
ul { list-style: none; padding: 0; margin: 0; }
.sub-item {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.1rem 0;
}
.sub-check { color: #555; font-size: 0.7rem; width: 12px; flex-shrink: 0; }
.sub-item.closed .sub-check { color: #4caf50; }
.sub-btn {
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.15rem 0.25rem;
    border-radius: 3px;
    text-align: left;
}
.sub-btn:hover { background: var(--border); }
.sub-num { color: #555; font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; flex-shrink: 0; }
.sub-title { color: #999; font-size: 0.78rem; }
.sub-item.closed .sub-title { color: #444; text-decoration: line-through; }
.hint {
    color: #2a2a2a;
    font-size: 0.8rem;
    font-family: 'JetBrains Mono', monospace;
}
.edit-actions {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
}
.edit-btn {
    background: none;
    border: 1px solid var(--accent);
    color: var(--accent);
    font-size: 0.7rem;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    opacity: 0.7;
    transition: opacity 0.15s;
}
.edit-btn:hover:not(:disabled) { opacity: 1; }
.edit-btn:disabled { opacity: 0.3; cursor: default; }
.edit-btn--cancel { border-color: #555; color: #555; }
.edit-inline {
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1.4;
    width: 100%;
    resize: none;
    padding: 0;
}
.edit-inline--body {
    font-size: 0.78rem;
    font-weight: normal;
    color: var(--text-secondary);
    line-height: 1.6;
    min-height: 4rem;
}
.issue-title, .body-text { cursor: text; }
.issue-title:hover, .body-text:hover {
    background: rgba(255,255,255,0.02);
    border-radius: 3px;
}
.save-error {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    color: #f44336;
}
.create-row {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}
.blink {
    color: #555;
    animation: blink 1.2s step-start infinite;
}
@keyframes blink {
    50% { opacity: 0.3; }
}

/* ── Symboles + Clusters ── */
.sym-tree { margin-top: 1.25rem; }

.sym-sec { margin-bottom: 0.25rem; }

.sym-group-hd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.3rem 0 0.1rem;
}
.sym-label {
    font-size: 0.55rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
}
.sym-state {
    font-size: 0.55rem;
    font-family: 'JetBrains Mono', monospace;
}
.sym-row {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    padding: 0.1rem 0;
    font-family: 'JetBrains Mono', monospace;
    min-width: 0;
}
.sym-bullet {
    font-size: 0.55rem;
    flex-shrink: 0;
}
.sym-key {
    font-size: 0.6rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Pourpre/violet — SYMBOLES */
.sym-sec--sym .sym-label,
.sym-sec--sym .sym-state  { color: #6655aa; }
.sym-sec--sym .sym-bullet { color: #6655aa; opacity: 0.45; }
.sym-sec--sym .sym-key    { color: #a090e0; }

/* Cyan/bleu — COALESCENCE */
.sym-sec--coal .sym-label,
.sym-sec--coal .sym-state  { color: #3a7f8f; }
.sym-sec--coal .sym-bullet { color: #3a7f8f; opacity: 0.45; }
.sym-sec--coal .sym-key    { color: #68c0cc; }

/* Vert sauge — DIR */
.sym-sec--dir .sym-label,
.sym-sec--dir .sym-state  { color: #3a7a48; }
.sym-sec--dir .sym-bullet { color: #3a7a48; opacity: 0.45; }
.sym-sec--dir .sym-key    { color: #7abf82; }

/* Ambre/doré — MIXTE */
.sym-sec--mixte .sym-label,
.sym-sec--mixte .sym-state  { color: #7a5e1e; }
.sym-sec--mixte .sym-bullet { color: #7a5e1e; opacity: 0.45; }
.sym-sec--mixte .sym-key    { color: #c8a454; }
</style>
