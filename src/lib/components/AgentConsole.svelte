<script lang="ts">
    import { onMount } from "svelte";
    import { agentState, agentRunState, planModeTask, consoleTab } from "$lib/stores/agent";
    import DiagramViewer from "$lib/components/DiagramViewer.svelte";
    import SymbolsView from "$lib/components/SymbolsView.svelte";
    import ArchiView from "$lib/components/ArchiView.svelte";

    // ─── PROJET — fichiers contexte ───────────────────────────────────────────
    type FileCard = { name: string; content: string; loading: boolean; error: string };
    const FILE_NAMES = ["README.md", "CLAUDE.md"];
    let files: FileCard[] = FILE_NAMES.map(name => ({ name, content: "", loading: true, error: "" }));
    let expandedFile: FileCard | null = null;

    onMount(() => {
        FILE_NAMES.forEach(async (name, i) => {
            try {
                const res = await fetch(`/api/repo-file?path=${encodeURIComponent(name)}`);
                const data = await res.json();
                files[i] = { name, content: data.content ?? "", loading: false, error: data.error ?? "" };
                files = [...files];
            } catch {
                files[i] = { name, content: "", loading: false, error: "Erreur" };
                files = [...files];
            }
        });
        loadStats();
        loadMethods();
    });

    function preview(content: string): string {
        return content.split("\n").slice(0, 9).join("\n");
    }

    // ─── PROJET — stats cartographie ─────────────────────────────────────────
    type CartoStats = {
        methods: number; files: number;
        withDescription: number; withEffects: number; withConsumers: number;
        roles: Record<string, number>;
        indexUpdatedAt: string | null; hasFileIndex: boolean; model: string | null;
    };
    let cartoStats: CartoStats | null = null;
    let cartoStatsError = "";

    async function loadStats() {
        try {
            const res = await fetch("/api/cartography/stats");
            const data = await res.json();
            if (data.error) cartoStatsError = data.error;
            else { cartoStats = data; cartoStatsError = ""; }
        } catch { cartoStatsError = "Stats inaccessibles"; }
    }

    // ─── PROJET — commandes cartographie ─────────────────────────────────────
    let runningCmd = "";
    let cmdLogs: string[] = [];

    async function runCmd(cmd: string) {
        runningCmd = cmd;
        cmdLogs = [];
        try {
            const res = await fetch("/api/cartography/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cmd })
            });
            const reader = res.body!.getReader();
            const dec = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                for (const line of dec.decode(value).split("\n")) {
                    if (line.startsWith("data: ")) {
                        try {
                            const { line: log } = JSON.parse(line.slice(6));
                            cmdLogs = [...cmdLogs.slice(-30), log];
                        } catch { /* skip */ }
                    }
                }
            }
        } finally {
            runningCmd = "";
            await loadStats();
        }
    }

    const CMD_BUTTONS = [
        { id: "full:force", label: "Init" },
    ];

    // ─── AGENT — recherche ────────────────────────────────────────────────────
    type SearchResult = {
        key: string; file: string; startLine: number | null; endLine: number | null;
        score: number; role: string; summary: string;
        codeSnippet: string | null; snippetError: string | null;
        _raw: Record<string, any>;
    };
    type GrepResult = { file: string; line: number; content: string; };

    // Résultats de la recherche utilisateur
    let searchQuery   = "";
    let queryLabel    = "";
    let queryGrep:    GrepResult[]   = [];
    let queryMethods: SearchResult[] = [];
    let querySemantic: SearchResult[] = [];
    let searchLoading  = false;
    let searchError    = "";

    // ─── Index méthodes ───────────────────────────────────────────────────────
    type MethodItem = { key: string; file: string; startLine: number | null; role: string; description: string; hasEffects: boolean; hasConsumers: boolean; };
    let allMethods: MethodItem[] = [];

    async function loadMethods() {
        try {
            const res  = await fetch("/api/cartography/methods");
            const data = await res.json();
            allMethods = data.methods ?? [];
        } catch { /* silencieux */ }
    }

    function getFiles() {
        const map = new Map<string, number>();
        for (const m of allMethods) { map.set(m.file || "?", (map.get(m.file || "?") ?? 0) + 1); }
        return [...map.entries()].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count);
    }

    // ─── Onglet actif ─────────────────────────────────────────────────────────
    let symbolsQuery = $planModeTask?.title ?? $agentState.issue?.title ?? "";
    let _prevPlanTask = $planModeTask;
    let _prevIssue = $agentState.issue;
    $: if ($planModeTask !== _prevPlanTask) { _prevPlanTask = $planModeTask; if ($planModeTask) symbolsQuery = $planModeTask.title; }
    $: if ($agentState.issue !== _prevIssue) { _prevIssue = $agentState.issue; if ($agentState.issue) symbolsQuery = $agentState.issue.title; }
    let activeTab = $consoleTab;
    $: consoleTab.set(activeTab);

    // Dérive les méthodes filtrées selon l'onglet actif
    $: filteredMethods = (() => {
        if (activeTab === "methods")          return allMethods;
        if (activeTab === "described")        return allMethods.filter(m => m.description);
        if (activeTab === "effects")          return allMethods.filter(m => m.hasEffects);
        if (activeTab === "consumers")        return allMethods.filter(m => m.hasConsumers);
        if (activeTab.startsWith("role:"))    return allMethods.filter(m => m.role === activeTab.slice(5));
        return [] as MethodItem[];
    })();

    $: filteredFiles = activeTab === "files" ? getFiles() : [];

    // Construction réactive des onglets
    type TabDef = { id: string; label: string; count: number | string };
    const HIDDEN_TABS = new Set(["methods", "files", "described", "consumers", "role:service", "role:helper", "role:entry", "role:flow", "role:core", "role:internal"]);

    $: tabs = ((): TabDef[] => {
        const t: TabDef[] = [];
        if (cartoStats) {
            t.push({ id: "methods",   label: "méthodes",  count: cartoStats.methods });
            t.push({ id: "files",     label: "fichiers",  count: cartoStats.files });
            t.push({ id: "described", label: "décrites",  count: `${cartoStats.withDescription}/${cartoStats.methods}` });
            if (cartoStats.withEffects   > 0) t.push({ id: "effects",   label: "effets",    count: cartoStats.withEffects });
            if (cartoStats.withConsumers > 0) t.push({ id: "consumers", label: "consumers", count: cartoStats.withConsumers });
            for (const [role, count] of Object.entries(cartoStats.roles).sort((a, b) => b[1] - a[1])) {
                t.push({ id: `role:${role}`, label: role, count });
            }
        }
        t.push({ id: "codebase", label: "codebase", count: "" });
        t.push({ id: "documentation", label: "docs", count: files.length });
        t.push({ id: "symbols", label: "symboles", count: "" });
        t.push({ id: "archi", label: "archi", count: "" });
        if (queryLabel) t.push({ id: "query", label: queryLabel, count: queryGrep.length });
        return t.filter(t => !HIDDEN_TABS.has(t.id));
    })();

    async function fetchSearch(q: string) {
        const res = await fetch("/api/cartography", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: q })
        });
        return res.json();
    }

    async function search() {
        if (!searchQuery.trim()) return;
        searchLoading = true;
        searchError   = "";
        queryGrep     = [];
        queryMethods  = [];
        querySemantic = [];
        try {
            const data = await fetchSearch(searchQuery);
            if (data.error) { searchError = data.error; return; }
            queryGrep     = data.grepResults ?? [];
            queryMethods  = data.grepMethods ?? [];
            querySemantic = queryMethods.length === 0 ? (data.results ?? []) : [];
            queryLabel    = searchQuery;
            activeTab     = "query";
        } catch (e: any) {
            searchError = e.message;
        } finally {
            searchLoading = false;
        }
    }

    function onSearchKey(e: KeyboardEvent) {
        if (e.key === "Enter") search();
    }


</script>


<!-- ═══════════════════════════════════════════════════════ PROJET ══ -->
{#if expandedFile}
    <div class="section fill">
        <div class="section-header">
            <button class="back-btn" onclick={() => expandedFile = null}>← Retour</button>
            <span>{expandedFile.name}</span>
        </div>
        <pre class="exp-content">{expandedFile.content}</pre>
    </div>
{:else}
    <div class="projet-section">
        <div class="section-header">
            ATLAS
            <div class="header-actions">
                {#each CMD_BUTTONS as btn}
                    <button
                        class="cmd-btn"
                        class:active={runningCmd === btn.id}
                        onclick={() => runCmd(btn.id)}
                        disabled={!!runningCmd}
                        title={btn.id}
                    >
                        {runningCmd === btn.id ? "…" : btn.label}
                    </button>
                {/each}
            </div>
        </div>

        <!-- Logs commande -->
        {#if cmdLogs.length > 0}
            <div class="cmd-logs">
                {#each cmdLogs.slice(-5) as log}
                    <div class="cmd-line">{log}</div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- ══════════════ AGENT WRAPPER (input + tabs + liste) ══════════════ -->
    <div class="agent-wrapper">

        <div class="todos-section">
            <div class="section-header todos-header">
                {#each tabs as t}
                    <button
                        class="tab"
                        class:tab-active={activeTab === t.id}
                        class:tab-todo={t.id === "todo"}
                        onclick={() => activeTab = t.id}
                    >{t.label}{#if t.count !== 0 && t.count !== ""}<span class="tab-count"> {t.count}</span>{/if}</button>
                {/each}
            </div>


        {#if searchError && activeTab === "query"}
            <p class="err-line">{searchError}</p>
        {:else if activeTab === "query"}
            {@const grep    = queryGrep}
            {@const methods = queryMethods}
            {@const sem     = querySemantic}
            <div class="result-area">
                {#if grep.length > 0}
                    <div class="result-list grouped">
                        {#each grep as g}
                            <div class="grep-item">
                                <div class="grep-item-top">
                                    <span class="grep-file">{g.file}<span class="grep-line">:{g.line}</span></span>
                                </div>
                                <span class="grep-content">{g.content}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
                {#if methods.length > 0}
                    <div class="result-list grouped">
                        {#each methods as r}
                            <div class="result-item">
                                <div class="result-head">
                                    <div class="result-meta">
                                        <span class="mono purple small">{r.key}</span>
                                        <span class="role-tag">{r.role}</span>
                                    </div>
                                    {#if r.summary}<div class="result-summary">{r.summary}</div>{/if}
                                    <div class="mono dim small">{r.file}{r.startLine ? `:${r.startLine}` : ""}</div>
                                </div>
                                {#if r.codeSnippet}<pre class="result-code-inline">{r.codeSnippet}</pre>{/if}
                            </div>
                        {/each}
                    </div>
                {/if}
                {#if sem.length > 0}
                    <div class="result-list grouped">
                        {#each sem as r}
                            <div class="result-item">
                                <div class="result-head">
                                    <div class="result-meta">
                                        <span class="mono purple small">{r.key}</span>
                                        <span class="role-tag">{r.role}</span>
                                        <span class="mono dim small" style="margin-left:auto">score {r.score}</span>
                                    </div>
                                    {#if r.summary}<div class="result-summary">{r.summary}</div>{/if}
                                    <div class="mono dim small">{r.file}{r.startLine ? `:${r.startLine}` : ""}</div>
                                </div>
                                {#if r.codeSnippet}
                                    <pre class="result-code-inline">{r.codeSnippet}</pre>
                                {:else}
                                    <div class="snippet-missing">{r.snippetError ?? "Code non disponible"}</div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {:else if activeTab === "codebase"}
            <div class="dv-panel">
                <DiagramViewer />
            </div>
        {:else if activeTab === "symbols"}
            <div class="dv-panel">
                <SymbolsView initialQuery={symbolsQuery} extraContext={$agentState.issue?.body ?? ''} />
            </div>
        {:else if activeTab === "archi"}
            <div class="dv-panel">
                <ArchiView />
            </div>
        {:else if activeTab === "documentation"}
            <div class="doc-files-tab">
                {#each files as file}
                    <button
                        class="doc-file-btn"
                        onclick={() => expandedFile = file}
                        disabled={file.loading || !!file.error}
                    >
                        {file.name}
                    </button>
                {/each}
            </div>
        {:else if activeTab === "files"}
            <div class="result-list">
                {#each filteredFiles as f}
                    <div class="grep-item">
                        <span class="grep-file">{f.path}</span>
                        <span class="mono dim small" style="margin-left:auto;flex-shrink:0">{f.count}</span>
                    </div>
                {/each}
            </div>
        {:else if filteredMethods.length > 0}
            <div class="result-list">
                {#each filteredMethods as m}
                    <div class="result-item">
                        <div class="result-head">
                            <div class="result-meta">
                                <span class="mono purple small">{m.key}</span>
                                <span class="role-tag">{m.role}</span>
                                <span class="mono dim small" style="margin-left:auto">{m.file}{m.startLine ? `:${m.startLine}` : ""}</span>
                            </div>
                            {#if m.description}<div class="result-summary">{m.description}</div>{/if}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
        </div>
    </div>
{/if}

<style>

/* ── Layout ───────────────────────────────────────────────────────── */
.projet-section {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    border-bottom: 2px solid var(--border);
}
.agent-wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}
.agent-search-header {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}
.agent-input {
    display: block;
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-muted);
    font-family: 'Inter', sans-serif;
    font-size: 0.68rem;
    letter-spacing: 0.05em;
    padding: 0.6rem 1rem;
}
.agent-input:focus { color: #aaa; }
.agent-input::placeholder { color: var(--border-strong); }
.todos-section {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border-bottom: 1px solid var(--border);
}
.todos-header {
    gap: 0;
    padding: 0;
    overflow-x: auto;
    flex-wrap: nowrap;
    scrollbar-width: none;
    flex-shrink: 0;
    position: relative;
    z-index: 1;
    background: var(--bg-panel);
}
.todos-header::-webkit-scrollbar { display: none; }
.tab {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #2e2e2e;
    padding: 0 0.55rem;
    height: 100%;
    border-right: 1px solid var(--border);
    transition: color 0.1s;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
}
.tab:hover { color: #555; }
.tab-active { color: #777; }
.tab-todo { color: #4a3a00; }
.tab-todo:hover { color: var(--color-impl); }
.tab-todo.tab-active { color: var(--color-impl); }
.tab-count { font-size: 0.5rem; opacity: 0.6; margin-left:1em; }
.search-submit {
    background: none;
    border: 1px solid #222;
    border-radius: 3px;
    color: #444;
    font-size: 0.72rem;
    padding: 0.15rem 0.4rem;
    cursor: pointer;
    flex-shrink: 0;
}
.search-submit:hover:not(:disabled) { color: var(--accent-hover); border-color: var(--accent-hover); }
.search-submit:disabled { opacity: 0.3; cursor: default; }
.section.fill {
    display: flex;
    flex-direction: column;
    height: 100%;
}
.section-header {
    padding: 0.6rem 1rem;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
}

/* ── Stats bar ────────────────────────────────────────────────────── */
.stats-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
    background: var(--bg-panel);
}
.stat { display: flex; gap: 0.25rem; align-items: baseline; }
.stat-l { font-size: 0.6rem; color: #333; text-transform: uppercase; letter-spacing: 0.08em; }
.stat-v { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: #9181f9; }
.sep { color: #222; font-size: 0.7rem; }
.role-tag { font-family: 'JetBrains Mono', monospace; font-size: 0.63rem; color: #444; }
.role-tag em { font-style: normal; color: #555; margin-left: 0.2rem; }
.spacer { flex: 1; }
.stat-meta { display: flex; gap: 0.4rem; align-items: center; }
.stat-model { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: #3a3a4a; }
.stat-fidx { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: #444; }
.stat-fidx.ok { color: #4a6a4a; }
.stat-ts { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: #333; }

/* ── Diagram panel ────────────────────────────────────────────────── */
.dv-panel {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
/* ── Actions header (droite) ──────────────────────────────────────── */
.header-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.4rem;
}

/* ── Boutons commandes ────────────────────────────────────────────── */
.cmd-btn {
    padding: 0.2rem 0.55rem;
    background: var(--bg-panel);
    border: 1px solid var(--border-strong);
    color: #666;
    font-size: 0.65rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    white-space: nowrap;
}
.cmd-btn:hover:not(:disabled) { background: var(--bg-subtle); color: #aaa; }
.cmd-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.cmd-btn.active:hover:not(:disabled) { background: var(--accent-hover); }
.cmd-btn:disabled { opacity: 0.4; cursor: default; }

/* ── Logs commande ────────────────────────────────────────────────── */
.cmd-logs {
    padding: 0.25rem 1rem;
    background: var(--bg-deep);
    border-bottom: 1px solid var(--border);
}
.cmd-line {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.63rem;
    color: #444;
    line-height: 1.4;
}

/* ── Documentation onglet ─────────────────────────────────────────── */
.doc-files-tab {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.5rem 0.75rem;
}
.doc-file-btn {
    background: none;
    border: 1px solid #222;
    color: #555;
    font-size: 0.62rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: color 0.15s, border-color 0.15s;
}
.doc-file-btn:hover:not(:disabled) { color: var(--accent-hover); border-color: var(--accent-hover); }
.doc-file-btn:disabled { opacity: 0.4; cursor: default; }

/* ── Expanded file ────────────────────────────────────────────────── */
.exp-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    color: #bbb;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
    margin: 0;
}

/* ── Recherche ────────────────────────────────────────────────────── */
.search-input {
    flex: 1;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-primary);
    font-family: 'Inter', sans-serif;
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    outline: none;
}
.search-input:focus { border-color: var(--accent); }
.search-input::placeholder { color: var(--border-strong); }
.err-line { padding: 0.35rem 0.75rem; color: #f44336; font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; }
.result-list {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    margin: 0.5rem 0.75rem;
}
.result-area {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}
.result-list.grouped {
    flex: 1;
    min-height: 60px;
    margin: 0;
    border: none;
    border-radius: 0;
    border-bottom: 1px solid var(--border);
}
.grep-item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.3rem 0.75rem;
    border-bottom: 1px solid var(--border);
}
.grep-item:hover { background: var(--bg-panel); }
.grep-item-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
}
.grep-file {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: #9181f9;
}
.grep-line { color: #555; }
.grep-content {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    color: #777;
    white-space: pre-wrap;
    word-break: break-all;
}
.result-list::-webkit-scrollbar { width: 6px; }
.result-list::-webkit-scrollbar-track { background: transparent; }
.result-list::-webkit-scrollbar-thumb {
    background: var(--scrollbar);
    border-radius: 3px;
}
.result-list::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }
.result-item {
    border-bottom: 1px solid var(--border);
}
.result-item:last-child { border-bottom: none; }
.result-head {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    width: 100%;
    padding: 0.4rem 0.75rem;
    background: none;
}
.result-head:hover { background: var(--bg-panel); }
.result-meta { display: flex; align-items: center; gap: 0.4rem; }
.result-summary { font-size: 0.72rem; color: #666; line-height: 1.3; }
.result-raw {
    margin: 0;
    padding: 0.3rem 0.75rem;
    background: var(--bg-deep);
    border-top: 1px solid var(--border);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem; color: #3a3a5a;
    white-space: pre-wrap; line-height: 1.4;
}
.result-code-inline {
    overflow-x: auto;
    padding: 0.5rem 0.75rem;
    background: var(--bg-deep);
    border-top: 1px solid var(--border);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem; color: #bbb;
    white-space: pre; margin: 0; line-height: 1.5;
}
.snippet-missing {
    padding: 0.3rem 0.75rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.63rem; color: #444;
    border-top: 1px solid var(--border);
}


/* ── Utilitaires ──────────────────────────────────────────────────── */
.back-btn {
    background: none; border: 1px solid var(--border-strong);
    color: var(--accent); font-size: 0.68rem;
    padding: 0.15rem 0.5rem; border-radius: 3px; cursor: pointer;
}
.back-btn:hover { background: var(--border); }
.mono { font-family: 'JetBrains Mono', monospace; }
.purple { color: #9181f9; }
.dim { color: #444; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; }
.small { font-size: 0.68rem; }
.blink { animation: blink 1.2s step-start infinite; }
@keyframes blink { 50% { opacity: 0.3; } }

</style>
