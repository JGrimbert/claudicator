<script lang="ts">
    import { agentState, notifyTaskCreated } from "$lib/stores/agent";

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
    type SymRow = { key: string; file: string; role: string | null; summary: string | null };

    let symbols: SymRow[] = [];
    let symbolsLoading = false;

    /** Mots significatifs (≥ 3 chars, hors stopwords) */
    function keywords(text: string): string[] {
        const stop = new Set(['les', 'des', 'une', 'avec', 'dans', 'pour', 'par', 'sur', 'son',
            'ses', 'leur', 'leurs', 'est', 'sont', 'the', 'and', 'with', 'from',
            'that', 'this', 'they', 'have', 'selon', 'projet', 'chemin']);
        return text.toLowerCase()
            .split(/[\s\n\r\\\/.,;:!?()\[\]{}#*`|]+/)
            .filter(w => w.length >= 3 && !stop.has(w));
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

            const result: SymRow[] = [];
            const seenKeys  = new Set<string>();
            const seenFiles = new Set<string>();

            // Résultats cartography
            for (const s of [...(carto.results ?? []), ...(carto.grepMethods ?? [])]) {
                if (seenKeys.has(s.key)) continue;
                seenKeys.add(s.key);
                seenFiles.add(s.file ?? '');
                result.push({ key: s.key, file: s.file ?? '', role: s.role ?? null, summary: s.summary ?? null });
            }

            // Résultats atlas — fichiers dont le nom correspond aux mots-clés
            if (atlas?.regions && kws.length > 0) {
                for (const [region, rd] of Object.entries(atlas.regions) as [string, { files: string[] }][]) {
                    for (const filePath of (rd.files ?? [])) {
                        if (seenFiles.has(filePath)) continue;
                        const base = (filePath.split('/').pop() ?? '').replace(/\.[^.]+$/, '').toLowerCase();
                        if (!kws.some(kw => base.includes(kw) || kw.includes(base))) continue;
                        const key = (filePath.split('/').pop() ?? filePath).replace(/\.[^.]+$/, '');
                        seenKeys.add(key);
                        seenFiles.add(filePath);
                        result.push({ key, file: filePath, role: region, summary: null });
                    }
                }
            }

            symbols = result;
        } catch { /* silencieux */ }
        finally { symbolsLoading = false; }
    }

    function groupByFile(syms: SymRow[]): [string, SymRow[]][] {
        const map = new Map<string, SymRow[]>();
        for (const s of syms) {
            const arr = map.get(s.file) ?? [];
            arr.push(s);
            map.set(s.file, arr);
        }
        return [...map.entries()];
    }

    function shortPath(file: string): string {
        const parts = file.replace(/\\/g, '/').split('/');
        return parts.slice(-2).join('/');
    }

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
            <button class="back-btn" onclick={navigateBack}>
                ← #{$agentState.navigationStack.at(-1)?.number}
            </button>
        {/if}
        <span>Artefact</span>
    </div>

    <div class="content">
        {#if $agentState.issue?.body}
            <div class="issue-body">
                <h2 class="issue-title">#{$agentState.issue.number} — {$agentState.issue.title}</h2>
                <pre class="body-text">{$agentState.issue.body}</pre>
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
        {:else if $agentState.status === "loading"}
            <p class="hint blink">Chargement...</p>
        {:else}
            <p class="hint">Sélectionnez une issue pour commencer.</p>
        {/if}
    </div>

    {#if $agentState.issue && (symbolsLoading || symbols.length > 0)}
        <div class="sym-section">
            <div class="sym-header">
                <span class="sym-label">Symboles</span>
                {#if symbolsLoading}
                    <span class="sym-state">…</span>
                {:else}
                    <span class="sym-state">{symbols.length}</span>
                {/if}
            </div>
            {#if !symbolsLoading && symbols.length > 0}
                <div class="sym-scroll">
                    {#each groupByFile(symbols) as [file, items] (file)}
                        <div class="sym-file">{shortPath(file)}</div>
                        {#each items as s (s.key)}
                            <div class="sym-row" title={s.summary ?? ''}>
                                <span class="sym-key">{s.key}</span>
                                {#if s.role}<span class="sym-role">{s.role}</span>{/if}
                                {#if s.summary}<span class="sym-desc">{s.summary}</span>{/if}
                            </div>
                        {/each}
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    {#if $agentState.issue}
        <div class="plan-section">
            <div class="plan-header">
                <span class="plan-label">Plan — #{$agentState.issue.number}</span>
                <button class="plan-btn" onclick={createTask} disabled={taskCreated} title="Créer une task liée à cette issue">
                    {taskCreated ? "✓ créée" : "+ Task"}
                </button>
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
}
.back-btn {
    background: none;
    border: 1px solid var(--border-strong);
    color: var(--accent);
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    text-transform: none;
    letter-spacing: normal;
    flex-shrink: 0;
}
.back-btn:hover { background: var(--border); }
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
.plan-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.62rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
}
.plan-btn:hover:not(:disabled) { color: var(--accent-hover); border-color: var(--accent-hover); }
.plan-btn:disabled { opacity: 0.4; cursor: default; }
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
.blink {
    color: #555;
    animation: blink 1.2s step-start infinite;
}
@keyframes blink {
    50% { opacity: 0.3; }
}

/* ── Symboles ── */
.sym-section {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    max-height: 35%;
    min-height: 2rem;
    background: #04040c;
}
.sym-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.28rem 1rem;
    border-bottom: 1px solid #111;
    flex-shrink: 0;
}
.sym-label {
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #303050;
}
.sym-state {
    font-size: 0.58rem;
    color: #252535;
    font-family: 'JetBrains Mono', monospace;
}
.sym-scroll {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
}
.sym-scroll::-webkit-scrollbar { width: 3px; }
.sym-scroll::-webkit-scrollbar-thumb { background: #1a1a2a; border-radius: 2px; }
.sym-file {
    padding: 0.18rem 1rem;
    background: #0a0a14;
    border-bottom: 1px solid #141420;
    font-size: 0.55rem;
    color: #2a2a3e;
    letter-spacing: 0.04em;
    font-family: 'JetBrains Mono', monospace;
    position: sticky;
    top: 0;
    z-index: 1;
}
.sym-row {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.15rem 1rem;
    border-bottom: 1px solid #0e0e18;
    font-family: 'JetBrains Mono', monospace;
    min-width: 0;
}
.sym-key {
    font-size: 0.6rem;
    color: #4a4a80;
    flex-shrink: 0;
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.sym-role {
    font-size: 0.5rem;
    color: #252538;
    font-style: italic;
    flex-shrink: 0;
}
.sym-desc {
    font-size: 0.57rem;
    color: #2e2e3e;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
