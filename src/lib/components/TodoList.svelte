<script lang="ts">
    import { onMount } from "svelte";
    import { notifyTaskCreated } from "$lib/stores/agent";
    import ItemRow from "$lib/components/ItemRow.svelte";
    import Fuse from 'fuse.js';

    type GrepResult = { file: string; line: number; content: string; };

    export let hideHeader = false;

    let todos: GrepResult[] = [];
    let loading = false;
    let filterQuery = "";

    $: todoFuse = new Fuse(todos, { keys: ['content', 'file'], threshold: 0.45 });
    $: displayedTodos = filterQuery.trim()
        ? todoFuse.search(filterQuery).map(r => r.item)
        : todos;

    function shortFile(path: string) {
        return path.split(/[\\/]/).pop() ?? path;
    }

    function todoTitle(content: string): string {
        return content.trim()
            .replace(/^(\/\/|\/\*+)\s*TODO:?\s*/i, "")
            .replace(/\*\/\s*$/, "")
            .trim() || content.trim();
    }

    async function load() {
        loading = true;
        try {
            const res = await fetch("/api/cartography", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: "TODO" })
            });
            const data = await res.json();
            todos = data.grepResults ?? [];
        } catch { /* silencieux */ } finally {
            loading = false;
        }
    }

    onMount(load);

    let creating: Record<string, boolean> = {};
    let created: Record<string, boolean> = {};

    async function createTask(g: GrepResult) {
        const key = `${g.file}:${g.line}`;
        if (creating[key] || created[key]) return;
        creating = { ...creating, [key]: true };
        try {
            const title = todoTitle(g.content).slice(0, 120);
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
            created = { ...created, [key]: true };
            notifyTaskCreated();
        } catch { /* silencieux */ } finally {
            creating = { ...creating, [key]: false };
        }
    }
</script>

<div class="panel">
    {#if !hideHeader}
    <div class="panel-header">
        <span>TODOs {#if !loading && todos.length > 0}<span class="count">{todos.length}</span>{/if}{#if loading}<span class="refreshing">↻</span>{/if}</span>
        <button class="refresh-btn" onclick={load} disabled={loading} title="Recharger">↻</button>
    </div>
    {/if}
    <div class="search-bar">
        <input class="search-input" placeholder="Filtrer…" bind:value={filterQuery} />
        {#if filterQuery}
            <button class="search-clear" onclick={() => filterQuery = ''}>✕</button>
        {/if}
    </div>

    <div class="list">
        {#if loading}
            <p class="hint">Chargement...</p>
        {:else if displayedTodos.length === 0}
            <p class="hint">{filterQuery ? 'Aucun résultat' : 'Aucun TODO trouvé'}</p>
        {:else}
            {#each displayedTodos as g}
                {@const key = `${g.file}:${g.line}`}
                <ItemRow
                    prefix="{shortFile(g.file)}:{g.line}"
                    title={todoTitle(g.content)}
                    action={{
                        label: "→ Task",
                        loading: creating[key],
                        done: created[key],
                        onclick: () => createTask(g)
                    }}
                />
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
    padding: 0.4rem 0.75rem 0.4rem 1rem;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.count {
    font-size: 0.6rem;
    color: #444;
    margin-left: 0.35rem;
}
.refresh-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.62rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: color 0.15s, border-color 0.15s;
}
.refresh-btn:hover:not(:disabled) { color: var(--accent-hover); border-color: var(--accent-hover); }
.refresh-btn:disabled { opacity: 0.35; cursor: default; }
.search-bar {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}
.search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    padding: 0.3rem 0.6rem;
}
.search-input::placeholder { color: var(--border-strong); }
.search-clear {
    background: none;
    border: none;
    color: #444;
    cursor: pointer;
    padding: 0 0.4rem;
    font-size: 0.7rem;
}
.search-clear:hover { color: #888; }
.list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}
.list::-webkit-scrollbar { width: 4px; }
.list::-webkit-scrollbar-track { background: transparent; }
.list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.list::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }
.hint { padding: 1rem; color: #333; font-size: 0.8rem; }
.refreshing { font-size: 0.65rem; color: #444; margin-left: 0.3rem; animation: spin 1s linear infinite; display: inline-block; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
