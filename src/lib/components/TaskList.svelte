<script lang="ts">
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import { agentState, taskRefreshTick, agentRunState, contextState, type RunLog, type ContextItem } from "$lib/stores/agent";
    import ItemRow from "$lib/components/ItemRow.svelte";
    import AgentInput from "$lib/components/AgentInput.svelte";

    type TaskStatus = "pending" | "running" | "done" | "failed";
    type Task = {
        id: string;
        title: string;
        status: TaskStatus;
        issueNumber?: number;
        branch?: string;
        logs: string[];
        createdAt: string;
        updatedAt: string;
    };

    const STATUS_LABEL: Record<TaskStatus, string> = {
        pending: "en attente",
        running: "en cours",
        done:    "terminé",
        failed:  "échoué",
    };
    const STATUS_COLOR: Record<TaskStatus, string> = {
        pending: "555555",
        running: "f7c948",
        done:    "4caf50",
        failed:  "f44336",
    };
    const FILTERS = ["all", "running", "pending", "done", "failed"] as const;
    type Filter = typeof FILTERS[number];

    let tasks: Task[] = [];
    let loading = true;
    let filter: Filter = "all";
    let selected: Task | null = null;
    let newTitle = "";
    let creating = false;

    $: filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);
    $: countOf = (f: Filter) => f === "all" ? tasks.length : tasks.filter(t => t.status === f).length;

    onMount(() => { loadTasks(); });

    $: if ($taskRefreshTick) loadTasks();

    async function loadTasks() {
        loading = true;
        try {
            const res = await fetch("/api/tasks");
            tasks = await res.json();
            if (selected) selected = tasks.find(t => t.id === selected!.id) ?? null;
        } finally {
            loading = false;
        }
    }

    async function createTask() {
        if (!newTitle.trim() || creating) return;
        creating = true;
        try {
            await fetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: newTitle.trim() }),
            });
            newTitle = "";
            await loadTasks();
        } finally {
            creating = false;
        }
    }

    async function setStatus(task: Task, status: TaskStatus) {
        await fetch(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        await loadTasks();
    }

    async function remove(task: Task) {
        await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
        if (selected?.id === task.id) selected = null;
        await loadTasks();
    }

    function onKey(e: KeyboardEvent) {
        if (e.key === "Enter") createTask();
    }

    // ─── Lancer Claude sur une task ──────────────────────────────────────────
    let showRunFor: string | null = null;
    let runPrompt = "";

    function serializeContext(label: string): string {
        const ctx = get(contextState);
        if (ctx.items.length === 0) return label;
        const lines = ctx.items.slice(0, 15).map(item => {
            if (item.kind === "method") {
                const loc = item.startLine ? `:${item.startLine}` : "";
                return `- ${item.file}${loc} — ${item.key}${item.summary ? ` : "${item.summary}"` : ""}`;
            }
            return `- ${item.file}:${item.line} — ${item.content.trim()}`;
        });
        return `Contexte du codebase pertinent :\n${lines.join("\n")}\n\nTâche : ${label}`;
    }

    async function runTask(task: Task) {
        const base   = runPrompt.trim() || task.title;
        const prompt = serializeContext(base);
        if (!base) return;
        showRunFor = null;
        runPrompt = "";
        agentRunState.set({ taskId: task.id, taskTitle: task.title, logs: [], running: true });
        try {
            const res = await fetch("/api/agent/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt, taskId: task.id })
            });
            if (!res.ok || !res.body) {
                agentRunState.update(s => ({
                    ...s,
                    running: false,
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
                            const event = JSON.parse(raw.slice(6)) as RunLog;
                            agentRunState.update(s => ({ ...s, logs: [...s.logs, event] }));
                        } catch { /* skip */ }
                    }
                }
            }
        } finally {
            agentRunState.update(s => ({ ...s, running: false }));
            await loadTasks();
        }
    }

    function openRun(task: Task) {
        showRunFor = task.id;
        runPrompt = task.title;
    }

    async function selectTask(task: Task) {
        if (selected?.id === task.id) { selected = null; contextState.set({ source: { kind: "task", label: "" }, items: [], loading: false, error: "" }); return; }
        selected = task;
        let issueBody = "";
        if (task.issueNumber) {
            agentState.update(s => ({ ...s, status: "loading", plan: null }));
            const res  = await fetch(`/api/issue?number=${task.issueNumber}`);
            const full = await res.json();
            issueBody  = full.body ?? "";
            agentState.update(s => ({
                ...s,
                issue: full,
                status: "idle",
                navigationStack: [],
                knownSubIssueNumbers: [
                    ...new Set([...s.knownSubIssueNumbers, ...(full.subIssues?.map((si: any) => si.number) ?? [])])
                ]
            }));
        }
        buildContext(task, issueBody);
    }

    async function buildContext(task: Task, issueBody = "") {
        // Construire une query dense : titre + première ligne significative du corps de l'issue
        const bodyLine = issueBody.split("\n").find(l => l.trim().length > 20)?.trim() ?? "";
        const query    = bodyLine ? `${task.title} ${bodyLine}`.slice(0, 250) : task.title;
        contextState.set({ source: { kind: "task", label: task.title }, items: [], loading: true, error: "" });
        try {
            const res  = await fetch("/api/cartography", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query })
            });
            const data = await res.json();
            if (data.error) { contextState.update(s => ({ ...s, loading: false, error: data.error })); return; }
            const items: ContextItem[] = [
                ...(data.grepMethods ?? []).map((m: any): ContextItem => ({
                    kind: "method", key: m.key, file: m.file, startLine: m.startLine ?? null,
                    summary: m.summary ?? "", snippet: m.codeSnippet ?? null
                })),
                ...(data.grepResults ?? []).map((g: any): ContextItem => ({
                    kind: "grep", file: g.file, line: g.line, content: g.content
                })),
            ];
            contextState.set({ source: { kind: "task", label: task.title }, items, loading: false, error: "" });
        } catch (e: any) {
            contextState.update(s => ({ ...s, loading: false, error: e.message }));
        }
    }
</script>

<div class="panel">
    <div class="panel-header">Tasks</div>

    <!-- Filtres -->
    <div class="filter-bar">
        {#each FILTERS as f}
            <button
                class="filter-btn"
                class:active={filter === f}
                onclick={() => filter = f}
            >
                {f === "all" ? "toutes" : STATUS_LABEL[f as TaskStatus]}
                {#if countOf(f) > 0}<span class="count">{countOf(f)}</span>{/if}
            </button>
        {/each}
        <button class="refresh-btn" onclick={loadTasks} title="Rafraîchir">↺</button>
    </div>

    <!-- Nouvelle task -->
    <div class="new-task">
        <input
            class="new-input"
            placeholder="Nouvelle task…"
            bind:value={newTitle}
            onkeydown={onKey}
            disabled={creating}
        />
    </div>

    <!-- Liste toujours visible -->
    <div class="list">
        {#if loading}
            <p class="hint">Chargement…</p>
        {:else if filtered.length === 0}
            <p class="hint">Aucune task</p>
        {:else}
            {#each filtered as task}
                <div class="task-row-wrap">
                    <ItemRow
                        prefix={task.issueNumber ? `#${task.issueNumber}` : ""}
                        title={task.title}
                        labels={[{ name: STATUS_LABEL[task.status], color: STATUS_COLOR[task.status] }]}
                        state={task.status === "failed" ? "closed" : "open"}
                        active={selected?.id === task.id}
                        onclick={() => selectTask(task)}
                    />
                    <button
                        class="task-delete-btn"
                        onclick={(e) => { e.stopPropagation(); remove(task); }}
                        title="Supprimer"
                    >✕</button>
                </div>
                {#if selected?.id === task.id}
                    <div class="inline-detail">
                        <div class="inline-meta">
                            {#if task.issueNumber}<span class="meta-tag">#{task.issueNumber}</span>{/if}
                            {#if task.branch}<span class="meta-tag mono">{task.branch}</span>{/if}
                            <span class="meta-tag dim">{new Date(task.createdAt).toLocaleDateString("fr-FR")}</span>
                        </div>
                        <div class="inline-actions">
                            {#if task.status === "running"}
                                <button class="action-btn danger" onclick={() => setStatus(task, "failed")}>Annuler</button>
                            {:else if task.status === "failed" || task.status === "pending"}
                                <button class="action-btn" onclick={() => setStatus(task, "pending")}>Relancer</button>
                            {/if}
                            <button class="action-btn danger" onclick={() => remove(task)}>Supprimer</button>
                        </div>
                        <AgentInput task={task} />
                        {#if $contextState.source.label === task.title}
                            <div class="ctx-section">
                                {#if $contextState.loading}
                                    <span class="ctx-hint">Recherche contexte…</span>
                                {:else if $contextState.error}
                                    <span class="ctx-hint err">{$contextState.error}</span>
                                {:else if $contextState.items.length > 0}
                                    <div class="ctx-header">Contexte — {$contextState.items.length}</div>
                                    {#each $contextState.items.slice(0, 8) as item}
                                        {#if item.kind === "method"}
                                            <div class="ctx-item">
                                                <span class="ctx-key">{item.key}</span>
                                                <span class="ctx-loc">{item.file}{item.startLine ? `:${item.startLine}` : ""}</span>
                                                {#if item.summary}<span class="ctx-summary">{item.summary}</span>{/if}
                                            </div>
                                        {:else}
                                            <div class="ctx-item">
                                                <span class="ctx-loc">{item.file}:{item.line}</span>
                                                <span class="ctx-content">{item.content.trim()}</span>
                                            </div>
                                        {/if}
                                    {/each}
                                    {#if $contextState.items.length > 8}
                                        <span class="ctx-hint">+{$contextState.items.length - 8} autres</span>
                                    {/if}
                                {:else}
                                    <span class="ctx-hint">Aucun contexte trouvé</span>
                                {/if}
                            </div>
                        {/if}
                        {#if task.logs.length > 0}
                            <div class="inline-logs">
                                {#each task.logs as log}
                                    <div class="log-line">{log}</div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/if}
            {/each}
        {/if}
    </div>
</div>

<style>
.panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.panel-header {
    padding: 0.6rem 1rem;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #555;
    border-bottom: 1px solid #1e1e1e;
    flex-shrink: 0;
}
.filter-bar {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #1a1a1a;
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: none;
}
.filter-bar::-webkit-scrollbar { display: none; }
.filter-btn {
    background: none;
    border: none;
    border-right: 1px solid #1a1a1a;
    color: #2e2e2e;
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0.4rem 0.55rem;
    cursor: pointer;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    transition: color 0.1s;
}
.filter-btn:hover { color: #555; }
.filter-btn.active { color: #777; }
.count {
    font-size: 0.5rem;
    opacity: 0.6;
    margin-left: 0.4rem;
}
.refresh-btn {
    background: none;
    border: none;
    color: #2a2a2a;
    font-size: 0.9rem;
    cursor: pointer;
    padding: 0 0.6rem;
    margin-left: auto;
    line-height: 1;
}
.refresh-btn:hover { color: #555; }
.new-task {
    border-bottom: 1px solid #1a1a1a;
    flex-shrink: 0;
}
.new-input {
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
    box-sizing: border-box;
}
.new-input:focus { color: #aaa; }
.new-input::placeholder { color: #222; }
.list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}
.list::-webkit-scrollbar { width: 4px; }
.list::-webkit-scrollbar-track { background: transparent; }
.list::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 2px; }
.task-row-wrap {
    position: relative;
}
.task-delete-btn {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #2a2a2a;
    font-size: 0.65rem;
    cursor: pointer;
    padding: 0.2rem 0.35rem;
    border-radius: 3px;
    opacity: 0;
    transition: opacity 0.1s, color 0.1s;
    line-height: 1;
}
.task-row-wrap:hover .task-delete-btn { opacity: 1; }
.task-delete-btn:hover { color: #f44336; }
.hint {
    padding: 1rem;
    color: #333;
    font-size: 0.8rem;
    font-family: 'JetBrains Mono', monospace;
}

/* ── Détail inline (accordéon) ── */
.inline-detail {
    background: #0d0d16;
    border-bottom: 1px solid #1a1a1a;
    border-left: 2px solid #7c6af7;
}
.inline-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0.35rem 1rem;
    border-bottom: 1px solid #141414;
}
.meta-tag {
    font-size: 0.62rem;
    padding: 0.05rem 0.4rem;
    border-radius: 10px;
    background: #1a1a2e;
    color: #555;
    border: 1px solid #2a2a2a;
}
.meta-tag.mono { font-family: 'JetBrains Mono', monospace; }
.meta-tag.dim { color: #333; }
.inline-actions {
    display: flex;
    gap: 0.4rem;
    padding: 0.35rem 1rem;
    border-bottom: 1px solid #141414;
}
.action-btn {
    background: none;
    border: 1px solid #2a2a2a;
    color: #444;
    font-size: 0.62rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
}
.action-btn:hover { color: #9181f9; border-color: #9181f9; }
.action-btn.danger:hover { color: #f44336; border-color: #f44336; }
.inline-logs {
    padding: 0.3rem 1rem;
    max-height: 120px;
    overflow-y: auto;
}
.log-line {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.63rem;
    color: #444;
    line-height: 1.5;
    border-bottom: 1px solid #111;
    padding: 0.1rem 0;
}
/* ── Contexte ─────────────────────────────────────────────────────── */
.ctx-section {
    border-top: 1px solid #141414;
    max-height: 160px;
    overflow-y: auto;
}
.ctx-header {
    padding: 0.25rem 1rem;
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #333;
    background: #0a0a16;
    border-bottom: 1px solid #141414;
    position: sticky;
    top: 0;
}
.ctx-item {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.5rem;
    align-items: baseline;
    padding: 0.2rem 1rem;
    border-bottom: 1px solid #0f0f18;
}
.ctx-item:hover { background: #0c0c18; }
.ctx-key  { font-family: 'JetBrains Mono', monospace; font-size: 0.63rem; color: #7c6af7; }
.ctx-loc  { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem;  color: #333; }
.ctx-summary { font-size: 0.63rem; color: #555; width: 100%; }
.ctx-content { font-family: 'JetBrains Mono', monospace; font-size: 0.62rem; color: #444; }
.ctx-hint { display: block; padding: 0.25rem 1rem; font-size: 0.62rem; color: #333; font-style: italic; }
.ctx-hint.err { color: #f44336; }

.run-btn { color: #7c6af7; border-color: #2a2a3a; }
.run-btn:hover:not(:disabled) { color: #9181f9; border-color: #9181f9; }
.run-btn.active { color: #9181f9; border-color: #9181f9; background: #0e0e1a; }
.run-btn:disabled { opacity: 0.3; cursor: default; }
.run-input-area {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem 1rem;
    border-top: 1px solid #141414;
}
.run-textarea {
    background: #070710;
    border: 1px solid #2a2a3a;
    border-radius: 3px;
    color: #888;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    padding: 0.4rem 0.6rem;
    resize: vertical;
    outline: none;
    line-height: 1.5;
}
.run-textarea:focus { border-color: #7c6af7; color: #bbb; }
.run-submit {
    align-self: flex-end;
    background: #7c6af7;
    border: none;
    border-radius: 3px;
    color: #fff;
    font-size: 0.65rem;
    padding: 0.25rem 0.75rem;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
}
.run-submit:hover:not(:disabled) { background: #9181f9; }
.run-submit:disabled { opacity: 0.4; cursor: default; }
</style>
