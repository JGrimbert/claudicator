<script lang="ts">
    import { onMount } from "svelte";
    import { agentState, notifyTaskCreated, agentRunState } from "$lib/stores/agent";

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
        loadTodos();
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
        { id: "full",       label: "Full" },
        { id: "full:force", label: "Full --force" },
        { id: "index",      label: "Index" },
        { id: "enrich",     label: "Enrich" },
        { id: "scan",       label: "Scan" },
    ];

    // ─── Collapse input / liste ───────────────────────────────────────────────
    let inputOpen = true;
    let listOpen  = true;

    // ─── AGENT — recherche ────────────────────────────────────────────────────
    type SearchResult = {
        key: string; file: string; startLine: number | null; endLine: number | null;
        score: number; role: string; summary: string;
        codeSnippet: string | null; snippetError: string | null;
        _raw: Record<string, any>;
    };
    type GrepResult = { file: string; line: number; content: string; };

    // Résultats TODO (chargés au montage, indépendants)
    let todoGrep:    GrepResult[]   = [];
    let todoMethods: SearchResult[] = [];
    let todoLoading  = false;

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
    let activeTab = "todo";

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
    const HIDDEN_TABS = new Set(["consumers", "role:service", "role:helper", "role:entry", "role:flow", "role:core"]);

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
        t.push({ id: "todo",  label: "todo",  count: todoGrep.length || (todoLoading ? "…" : 0) });
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

    async function loadTodos() {
        todoLoading = true;
        try {
            const data = await fetchSearch("TODO");
            todoGrep    = data.grepResults ?? [];
            todoMethods = data.grepMethods ?? [];
        } catch { /* silencieux */ } finally {
            todoLoading = false;
        }
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

    // ─── Créer une task depuis un TODO ────────────────────────────────────────
    let creatingTodo: Record<string, boolean> = {};
    let createdTodo:  Record<string, boolean> = {};

    async function createTaskFromTodo(g: GrepResult) {
        const key = `${g.file}:${g.line}`;
        if (creatingTodo[key] || createdTodo[key]) return;
        creatingTodo = { ...creatingTodo, [key]: true };
        try {
            const rawTitle = g.content.trim()
                .replace(/^(\/\/|\/\*+)\s*TODO:?\s*/i, "")
                .replace(/\*\/\s*$/, "")
                .trim();
            const title = (rawTitle || g.content.trim()).slice(0, 120);

            const match = g.content.match(/#(\d+)/);
            let issueNumber: number | undefined;

            if (match) {
                issueNumber = Number(match[1]);
            } else {
                const res = await fetch("/api/github/issues", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: title.slice(0, 80),
                        body: `Trouvé dans \`${g.file}:${g.line}\`\n\n\`\`\`\n${g.content.trim()}\n\`\`\``
                    })
                });
                const data = await res.json();
                if (data.number) issueNumber = data.number;
            }

            await fetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, issueNumber })
            });
            createdTodo = { ...createdTodo, [key]: true };
            notifyTaskCreated();
        } catch { /* silencieux */ } finally {
            creatingTodo = { ...creatingTodo, [key]: false };
        }
    }

</script>

<!-- ══════════════════════════════════════════════════ RUN CONSOLE ══ -->
{#if $agentRunState.logs.length > 0}
    <div class="run-console">
        <div class="run-console-header">
            <span class="run-title">{$agentRunState.taskTitle || "Claude"}</span>
            {#if $agentRunState.running}
                <span class="run-blink">●</span>
            {/if}
            <button class="run-clear" onclick={() => agentRunState.update(s => ({ ...s, logs: [] }))}>✕</button>
        </div>
        <div class="run-log-area">
            {#each $agentRunState.logs as entry}
                <div class="run-log-line" class:system={entry.type === "system"}>{entry.line}</div>
            {/each}
        </div>
    </div>
{/if}

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
        <div class="section-header">Projet</div>

        <!-- Boutons commandes -->
            <div class="cmd-bar">
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

            <!-- Logs commande -->
            {#if cmdLogs.length > 0}
                <div class="cmd-logs">
                    {#each cmdLogs.slice(-5) as log}
                        <div class="cmd-line">{log}</div>
                    {/each}
                </div>
            {/if}

            <!-- Cards fichiers -->
            <div class="cards-row">
                {#each files as file}
                    <button
                        class="file-card"
                        onclick={() => expandedFile = file}
                        disabled={file.loading || !!file.error}
                    >
                        <div class="card-name">{file.name}</div>
                        {#if file.loading}
                            <span class="dim">Chargement…</span>
                        {:else if file.error}
                            <span class="card-err">{file.error}</span>
                        {:else}
                            <pre class="card-preview">{preview(file.content)}</pre>
                        {/if}
                    </button>
                {/each}
            </div>
    </div>

    <!-- ══════════════ AGENT WRAPPER (input + tabs + liste) ══════════════ -->
    <div class="agent-wrapper">

        {#if inputOpen}
            <div class="agent-search-header">
                <input
                    class="agent-input"
                    type="text"
                    placeholder="Rechercher dans le code…"
                    bind:value={searchQuery}
                    onkeydown={onSearchKey}
                />
            </div>
        {/if}

        <div class="todos-section">
            <div class="section-header todos-header">
                <button class="toggle-btn toggle-up" onclick={() => inputOpen = !inputOpen} title="Toggle input">▲</button>
                {#each tabs as t}
                    <button class="tab" class:tab-active={activeTab === t.id} onclick={() => activeTab = t.id}>
                        {t.label}{#if t.count !== 0 && t.count !== ""}<span class="tab-count"> {t.count}</span>{/if}
                    </button>
                {/each}
                <button class="toggle-btn toggle-down" onclick={() => listOpen = !listOpen} title="Toggle liste">▼</button>
            </div>

        {#if listOpen}
        {#if searchError && activeTab === "query"}
            <p class="err-line">{searchError}</p>
        {:else if activeTab === "todo" || activeTab === "query"}
            {@const grep    = activeTab === "todo" ? todoGrep    : queryGrep}
            {@const methods = activeTab === "todo" ? todoMethods : queryMethods}
            {@const sem     = activeTab === "todo" ? []          : querySemantic}
            <div class="result-area">
                {#if grep.length > 0}
                    <div class="result-group-header">Occurrences — {grep.length}</div>
                    <div class="result-list grouped">
                        {#each grep as g}
                            {@const key = `${g.file}:${g.line}`}
                            <div class="grep-item">
                                <div class="grep-item-top">
                                    <span class="grep-file">{g.file}<span class="grep-line">:{g.line}</span></span>
                                    {#if activeTab === "todo"}
                                        <button
                                            class="todo-task-btn"
                                            class:done={createdTodo[key]}
                                            onclick={() => createTaskFromTodo(g)}
                                            disabled={creatingTodo[key] || createdTodo[key]}
                                            title="Créer une task depuis ce TODO"
                                        >{createdTodo[key] ? "✓" : creatingTodo[key] ? "…" : "→ Task"}</button>
                                    {/if}
                                </div>
                                <span class="grep-content">{g.content}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
                {#if methods.length > 0}
                    <div class="result-group-header">Méthodes — {methods.length}</div>
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
                    <div class="result-group-header">Méthodes pertinentes — {sem.length}</div>
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
        {/if}
        </div>
    </div>
{/if}

<style>
/* ── Run Console ──────────────────────────────────────────────────── */
.run-console {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    max-height: 40%;
    min-height: 80px;
    border-bottom: 2px solid #2a2a3a;
    background: #05050f;
}
.run-console-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid #1a1a2a;
    flex-shrink: 0;
}
.run-title {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #7c6af7;
}
.run-blink {
    font-size: 0.6rem;
    color: #7c6af7;
    animation: blink 1.2s step-start infinite;
}
.run-clear {
    margin-left: auto;
    background: none;
    border: none;
    color: #333;
    font-size: 0.7rem;
    cursor: pointer;
    padding: 0.1rem 0.3rem;
    line-height: 1;
}
.run-clear:hover { color: #666; }
.run-log-area {
    flex: 1;
    overflow-y: auto;
    padding: 0.4rem 1rem;
}
.run-log-area::-webkit-scrollbar { width: 4px; }
.run-log-area::-webkit-scrollbar-track { background: transparent; }
.run-log-area::-webkit-scrollbar-thumb { background: #1e1e2e; border-radius: 2px; }
.run-log-line {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    color: #888;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
}
.run-log-line.system { color: #444; font-style: italic; }

/* ── Layout ───────────────────────────────────────────────────────── */
.projet-section {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    border-bottom: 2px solid #1e1e1e;
}
.agent-wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}
.toggle-btn {
    background: none;
    border: none;
    color: #252525;
    font-size: 0.45rem;
    cursor: pointer;
    padding: 0 0.5rem;
    flex-shrink: 0;
    height: 100%;
}
.toggle-btn:hover { color: #666; }
.toggle-up  { border-right: 1px solid #1a1a1a; }
.toggle-down { margin-left: auto; border-left: 1px solid #1a1a1a; }
.agent-search-header {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #1e1e1e;
    flex-shrink: 0;
}
.agent-input {
    display: block;
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: #555;
    font-family: 'Inter', sans-serif;
    font-size: 0.68rem;
    letter-spacing: 0.05em;
    padding: 0.6rem 1rem;
}
.agent-input:focus { color: #aaa; }
.agent-input::placeholder { color: #222; }
.cmd-bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 1rem;
    border-bottom: 1px solid #1a1a1a;
    flex-shrink: 0;
}
.todos-section {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border-bottom: 1px solid #1e1e1e;
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
    background: #0c0c12;
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
    border-right: 1px solid #1a1a1a;
    transition: color 0.1s;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
}
.tab:hover { color: #555; }
.tab-active { color: #777; }
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
.search-submit:hover:not(:disabled) { color: #9181f9; border-color: #9181f9; }
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
    color: #555;
    border-bottom: 1px solid #1e1e1e;
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
    border-bottom: 1px solid #1a1a1a;
    flex-wrap: wrap;
    background: #0e0e14;
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

/* ── Boutons commandes ────────────────────────────────────────────── */
.cmd-btn {
    padding: 0.2rem 0.55rem;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    color: #666;
    font-size: 0.65rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    white-space: nowrap;
}
.cmd-btn:hover:not(:disabled) { background: #222; color: #aaa; }
.cmd-btn.active { background: #7c6af7; border-color: #7c6af7; color: #fff; }
.cmd-btn.active:hover:not(:disabled) { background: #9181f9; }
.cmd-btn:disabled { opacity: 0.4; cursor: default; }

/* ── Logs commande ────────────────────────────────────────────────── */
.cmd-logs {
    padding: 0.25rem 1rem;
    background: #090910;
    border-bottom: 1px solid #1a1a1a;
}
.cmd-line {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.63rem;
    color: #444;
    line-height: 1.4;
}

/* ── Cards fichiers ───────────────────────────────────────────────── */
.cards-row {
    display: flex;
}
.file-card {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    border-right: 1px solid #1a1a1a;
    cursor: pointer;
    text-align: left;
    height: 160px;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    overflow: hidden;
    transition: background 0.1s;
}
.file-card:last-child { border-right: none; }
.file-card:hover:not(:disabled) { background: #111118; }
.file-card:disabled { cursor: default; }
.card-name {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #d2b292;
    flex-shrink: 0;
}
.card-preview {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.67rem;
    color: #555;
    white-space: pre-wrap;
    word-break: break-word;
    overflow: hidden;
    line-height: 1.45;
    margin: 0;
    flex: 1;
    text-align: left;
}
.card-err { font-size: 0.72rem; color: #f44336; }

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
    background: #111118;
    border: 1px solid #222;
    border-radius: 3px;
    color: #ccc;
    font-family: 'Inter', sans-serif;
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    outline: none;
}
.search-input:focus { border-color: #7c6af7; }
.search-input::placeholder { color: #2a2a2a; }
.err-line { padding: 0.35rem 0.75rem; color: #f44336; font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; }
.result-list {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    border: 1px solid #1e1e1e;
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
    border-bottom: 1px solid #1a1a1a;
}
.result-group-header {
    padding: 0.3rem 0.75rem;
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #333;
    background: #0c0c14;
    border-bottom: 1px solid #1a1a1a;
    flex-shrink: 0;
}
.grep-item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.3rem 0.75rem;
    border-bottom: 1px solid #141414;
}
.grep-item:hover { background: #111118; }
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
.todo-task-btn {
    background: none;
    border: 1px solid #2a2a2a;
    color: #444;
    font-size: 0.6rem;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
    transition: color 0.1s, border-color 0.1s;
}
.todo-task-btn:hover:not(:disabled) { color: #9181f9; border-color: #9181f9; }
.todo-task-btn.done { color: #4caf50; border-color: #4caf50; }
.todo-task-btn:disabled { opacity: 0.5; cursor: default; }
.result-list::-webkit-scrollbar { width: 6px; }
.result-list::-webkit-scrollbar-track { background: transparent; }
.result-list::-webkit-scrollbar-thumb {
    background: #2a2a2a;
    border-radius: 3px;
}
.result-list::-webkit-scrollbar-thumb:hover { background: #3a3a4a; }
.result-item {
    border-bottom: 1px solid #1a1a1a;
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
.result-head:hover { background: #111118; }
.result-meta { display: flex; align-items: center; gap: 0.4rem; }
.result-summary { font-size: 0.72rem; color: #666; line-height: 1.3; }
.result-raw {
    margin: 0;
    padding: 0.3rem 0.75rem;
    background: #07070f;
    border-top: 1px solid #181820;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem; color: #3a3a5a;
    white-space: pre-wrap; line-height: 1.4;
}
.result-code-inline {
    overflow-x: auto;
    padding: 0.5rem 0.75rem;
    background: #090910;
    border-top: 1px solid #1a1a1a;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem; color: #bbb;
    white-space: pre; margin: 0; line-height: 1.5;
}
.snippet-missing {
    padding: 0.3rem 0.75rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.63rem; color: #444;
    border-top: 1px solid #141414;
}


/* ── Utilitaires ──────────────────────────────────────────────────── */
.back-btn {
    background: none; border: 1px solid #2a2a2a;
    color: #7c6af7; font-size: 0.68rem;
    padding: 0.15rem 0.5rem; border-radius: 3px; cursor: pointer;
}
.back-btn:hover { background: #1e1e2e; }
.mono { font-family: 'JetBrains Mono', monospace; }
.purple { color: #9181f9; }
.dim { color: #444; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; }
.small { font-size: 0.68rem; }
.blink { animation: blink 1.2s step-start infinite; }
@keyframes blink { 50% { opacity: 0.3; } }
</style>
