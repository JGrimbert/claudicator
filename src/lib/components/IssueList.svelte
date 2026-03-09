<script lang="ts">
    import { onMount } from "svelte";
    import { agentState, type Issue } from "$lib/stores/agent";
    import ItemRow from "$lib/components/ItemRow.svelte";

    let issues: Issue[] = [];
    let loading = true;
    let error = "";

    $: filteredIssues = issues.filter(i =>
        i.state === "open" && !$agentState.knownSubIssueNumbers.includes(i.number)
    );

    async function loadIssues() {
        loading = true;
        error = "";
        try {
            const res = await fetch("/api/issues");
            if (!res.ok) throw new Error(await res.text());
            issues = await res.json();
        } catch (e: any) {
            error = e.message ?? "Erreur chargement issues";
        } finally {
            loading = false;
        }
    }

    onMount(loadIssues);

    // ── Création d'issue ──────────────────────────────────────────────────
    let creating = false;
    let newTitle = "";
    let newBody = "";
    let createError = "";
    let createLoading = false;

    function openCreate() { creating = true; newTitle = ""; newBody = ""; createError = ""; }
    function closeCreate() { creating = false; }

    async function submitCreate() {
        if (!newTitle.trim() || createLoading) return;
        createLoading = true;
        createError = "";
        try {
            const res = await fetch("/api/issues", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: newTitle, body: newBody })
            });
            const data = await res.json();
            if (data.error) { createError = data.error; return; }
            creating = false;
            await loadIssues();
        } catch (e: any) {
            createError = e.message;
        } finally {
            createLoading = false;
        }
    }

    function onTitleKey(e: KeyboardEvent) {
        if (e.key === "Escape") closeCreate();
    }

    async function select(issue: Issue) {
        agentState.update(s => ({
            ...s,
            issue: { ...issue, body: "", subIssues: [] },
            plan: null,
            status: "loading",
            navigationStack: []
        }));

        const res = await fetch(`/api/issue?number=${issue.number}`);
        const full = await res.json();

        agentState.update(s => ({
            ...s,
            issue: full,
            status: "idle",
            knownSubIssueNumbers: [
                ...new Set([...s.knownSubIssueNumbers, ...(full.subIssues?.map((si: any) => si.number) ?? [])])
            ]
        }));
    }
</script>

<div class="panel">
    <div class="panel-header">
        <span>Issues</span>
        <button class="new-btn" on:click={creating ? closeCreate : openCreate} title="Nouvelle issue">
            {creating ? "✕" : "+"}
        </button>
    </div>

    {#if creating}
        <div class="create-form">
            <input
                class="create-input"
                placeholder="Titre de l'issue"
                bind:value={newTitle}
                on:keydown={onTitleKey}
                disabled={createLoading}
            />
            <textarea
                class="create-body"
                placeholder="Description (optionnelle)"
                bind:value={newBody}
                rows="3"
                disabled={createLoading}
            ></textarea>
            {#if createError}
                <span class="create-error">{createError}</span>
            {/if}
            <div class="create-actions">
                <button class="btn-submit" on:click={submitCreate} disabled={!newTitle.trim() || createLoading}>
                    {createLoading ? "Création…" : "Créer l'issue"}
                </button>
                <button class="btn-cancel-sm" on:click={closeCreate} disabled={createLoading}>Annuler</button>
            </div>
        </div>
    {/if}

    <div class="list">
        {#if loading}
            <p class="hint">Chargement...</p>
        {:else if error}
            <p class="error">{error}</p>
        {:else if filteredIssues.length === 0}
            <p class="hint">Aucune issue ouverte</p>
        {:else}
            {#each filteredIssues as issue}
                <ItemRow
                    prefix="#{issue.number}"
                    title={issue.title}
                    labels={issue.labels ?? []}
                    state={issue.state}
                    active={$agentState.issue?.number === issue.number}
                    onclick={() => select(issue)}
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
    color: #555;
    border-bottom: 1px solid #1e1e1e;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.new-btn {
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
.new-btn:hover { color: #9181f9; border-color: #9181f9; }
.create-form {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid #1e1e1e;
    flex-shrink: 0;
    background: #0a0a12;
}
.create-input, .create-body {
    background: #070710;
    border: 1px solid #2a2a3a;
    border-radius: 3px;
    color: #ccc;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    padding: 0.3rem 0.5rem;
    outline: none;
    resize: none;
    transition: border-color 0.15s;
}
.create-input:focus, .create-body:focus { border-color: #7c6af7; }
.create-input::placeholder, .create-body::placeholder { color: #2a2a3a; }
.create-body { line-height: 1.5; }
.create-error {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    color: #f44336;
}
.create-actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
}
.btn-submit {
    background: #1a1040;
    border: 1px solid #4a3a8a;
    color: #9181f9;
    font-size: 0.65rem;
    padding: 0.22rem 0.65rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.15s;
}
.btn-submit:hover:not(:disabled) { background: #251850; }
.btn-submit:disabled { opacity: 0.35; cursor: default; }
.btn-cancel-sm {
    background: none;
    border: 1px solid #2a2a2a;
    color: #444;
    font-size: 0.65rem;
    padding: 0.22rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
}
.btn-cancel-sm:hover { color: #777; border-color: #444; }
.list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}
.list::-webkit-scrollbar { width: 4px; }
.list::-webkit-scrollbar-track { background: transparent; }
.list::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 2px; }
.list::-webkit-scrollbar-thumb:hover { background: #2a2a2a; }
.hint { padding: 1rem; color: #333; font-size: 0.8rem; }
.error { padding: 1rem; color: #f44336; font-size: 0.8rem; }
</style>
