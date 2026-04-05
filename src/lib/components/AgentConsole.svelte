<script lang="ts">
    import { onMount } from "svelte";
    import { agentState, agentRunState, planModeTask, consoleTab, testRunState } from "$lib/stores/agent";
    import DiagramViewer from "$lib/components/DiagramViewer.svelte";
    import SymbolsView from "$lib/components/SymbolsView.svelte";
    import ArchiView from "$lib/components/ArchiView.svelte";
    import RunConsole from "$lib/components/RunConsole.svelte";
    import { JgrBtn } from 'jgr-ui';

    // ─── PROJET — fichiers contexte ───────────────────────────────────────────
    type FileCard = { name: string; content: string; loading: boolean; error: string };
    const FILE_NAMES = ["README.md", "CLAUDE.md"];
    let files: FileCard[] = FILE_NAMES.map(name => ({ name, content: "", loading: true, error: "" }));
    let expandedFile: FileCard | null = null;

    onMount(() => {
        // Restaurer le dernier run de tests (survit au refresh HMR)
        try {
            const saved = sessionStorage.getItem("lastTestRun");
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.planId) testRunState.set({ ...parsed, running: false });
            }
            const savedTab = sessionStorage.getItem("lastConsoleTab");
            if (savedTab) consoleTab.set(savedTab);
        } catch { /* sessionStorage indisponible */ }

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
    $: activeTab = $consoleTab;

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
        t.push({ id: "atlas", label: "ATLAS", count: "" });
        t.push({ id: "documentation", label: "docs", count: files.length });
        t.push({ id: "symbols", label: "symboles", count: "" });
        t.push({ id: "archi", label: "archi", count: "" });
        t.push({ id: "console", label: "CONSOLE", count: "" });
        if ($testRunState.planId) t.push({ id: "tests", label: $testRunState.running ? "TESTS…" : $testRunState.exitCode === 0 ? "TESTS ✓" : $testRunState.exitCode !== null ? "TESTS ✕" : "TESTS", count: "" });
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
            consoleTab.set("query");
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
            <JgrBtn variant="back" onclick={() => expandedFile = null}>← Retour</JgrBtn>
            <span>{expandedFile.name}</span>
        </div>
        <pre class="exp-content">{expandedFile.content}</pre>
    </div>
{:else}
    <!-- ══════════════ AGENT WRAPPER (input + tabs + liste) ══════════════ -->
    <div class="agent-wrapper">

        <div class="todos-section">
            <div class="section-header todos-header">
                {#each tabs as t}
                    <button
                        class="tab"
                        class:tab-active={activeTab === t.id}
                        class:tab-todo={t.id === "todo"}
                        onclick={() => { consoleTab.set(t.id); try { sessionStorage.setItem("lastConsoleTab", t.id); } catch { /* SSR */ } }}
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
        {:else if activeTab === "atlas"}
            <div class="dv-panel">
                <div class="atlas-init-bar">
                    {#each CMD_BUTTONS as btn}
                        <JgrBtn variant="cmd" active={runningCmd === btn.id}
                            onclick={() => runCmd(btn.id)}
                            disabled={!!runningCmd} title={btn.id}>
                            {runningCmd === btn.id ? "…" : btn.label}
                        </JgrBtn>
                    {/each}
                    {#if cmdLogs.length > 0}
                        <div class="cmd-logs inline">
                            {#each cmdLogs.slice(-3) as log}
                                <div class="cmd-line">{log}</div>
                            {/each}
                        </div>
                    {/if}
                </div>
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
                    <JgrBtn
                        variant="file"
                        onclick={() => expandedFile = file}
                        disabled={file.loading || !!file.error}
                    >
                        {file.name}
                    </JgrBtn>
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
        <div class="dv-panel" style:display={activeTab === "console" ? "flex" : "none"}>
            <RunConsole />
        </div>
        <div class="dv-panel tc-panel" style:display={activeTab === "tests" ? "flex" : "none"}>
            {#if $testRunState.planId}
                <div class="tc-topbar">
                    <span class="tc-label">Tests — #{$testRunState.issueNumber}</span>
                    {#if $testRunState.running}
                        <span class="tc-spin"></span>
                    {:else if $testRunState.exitCode !== null}
                        <span class="tc-result" class:tc-pass={$testRunState.exitCode === 0} class:tc-fail={$testRunState.exitCode !== 0}>
                            {$testRunState.exitCode === 0 ? "✓ PASS" : "✕ FAIL"}
                        </span>
                    {/if}
                    <button class="tc-dismiss" onclick={() => testRunState.set({ planId: null, issueNumber: null, logs: [], running: false, exitCode: null })}>✕</button>
                </div>
                <pre class="tc-output">{$testRunState.logs.map(l => l.line).join("\n")}</pre>
            {/if}
        </div>
        </div>
    </div>
{/if}

<style>

/* ── Layout ───────────────────────────────────────────────────────── */
.agent-wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}
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

.role-tag { font-family: 'JetBrains Mono', monospace; font-size: 0.63rem; color: #444; }
.role-tag em { font-style: normal; color: #555; margin-left: 0.2rem; }

/* ── Diagram panel ────────────────────────────────────────────────── */
.dv-panel {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
/* ── Test console panel ───────────────────────────────────────────── */
.tc-panel { flex-direction: column; background: #0a0a0a; }
.tc-topbar {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 10px; border-bottom: 1px solid #222;
    background: #111; flex-shrink: 0;
}
.tc-label { flex: 1; font-size: 0.65rem; color: #777; font-family: 'JetBrains Mono', monospace; }
.tc-result { font-size: 0.65rem; padding: 1px 6px; border-radius: 3px; font-family: 'JetBrains Mono', monospace; }
.tc-pass { background: rgba(76,175,80,0.2); color: #4caf50; }
.tc-fail { background: rgba(244,67,54,0.2); color: #f44336; }
.tc-spin::before { content: "⠋"; font-family: monospace; color: #888; font-size: 0.75rem; animation: spin-braille 0.8s steps(8,end) infinite; }
.tc-dismiss { background: none; border: none; cursor: pointer; color: #444; font-size: 0.65rem; padding: 0; }
.tc-dismiss:hover { color: #f44336; }
.tc-output {
    flex: 1; margin: 0; padding: 10px;
    font-family: 'JetBrains Mono', monospace; font-size: 0.7rem;
    color: #ccc; background: transparent;
    overflow-y: auto; white-space: pre-wrap; word-break: break-all; line-height: 1.6;
}

/* ── Atlas init bar ───────────────────────────────────────────────── */
.atlas-init-bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}
.cmd-logs.inline {
    display: flex;
    flex-direction: column;
    margin-left: 0.5rem;
}

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
.mono { font-family: 'JetBrains Mono', monospace; }
.purple { color: #9181f9; }
.dim { color: #444; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; }
.small { font-size: 0.68rem; }

</style>
