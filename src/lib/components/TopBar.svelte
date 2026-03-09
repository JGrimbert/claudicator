<script lang="ts">
    import { onMount } from "svelte";
    import { agentState, projectUsage } from "$lib/stores/agent";
    import ProjectSettings from "./ProjectSettings.svelte";

    type Project = { id: string; name: string; path: string; owner?: string; repo?: string };

    const statusLabels: Record<string, string> = {
        idle: "—",
        loading: "chargement…",
        planning: "planification…",
        done: "terminé",
        error: "erreur"
    };

    let projects: Project[] = [];
    let currentId: string | null = null;
    let loadError = "";

    type GhRepo = { name: string; fullName: string; owner: string; private: boolean; configured: boolean };

    let adding = false;
    let newPath = "";
    let addError = "";
    let addLoading = false;
    let ghRepos: GhRepo[] = [];
    let ghLoading = false;
    let selectedRepo: GhRepo | null = null;

    onMount(loadProjects);

    async function loadProjects() {
        loadError = "";
        try {
            const res = await fetch("/api/projects");
            if (!res.ok) { loadError = `HTTP ${res.status}`; return; }
            const data = await res.json();
            projects = data.projects ?? [];
            currentId = data.current ?? null;
        } catch (e: any) {
            loadError = e.message;
        }
    }

    async function openAdd() {
        adding = true;
        newPath = "";
        addError = "";
        selectedRepo = null;
        ghRepos = [];
        ghLoading = true;
        try {
            const res = await fetch("/api/projects/github");
            if (res.ok) ghRepos = await res.json();
        } catch { /* pas de GitHub configuré */ }
        finally { ghLoading = false; }
    }

    function selectGhRepo(r: GhRepo) {
        selectedRepo = r;
        // Devine le chemin local depuis le premier projet configuré
        const base = projects[0]?.path
            ? projects[0].path.replace(/[/\\][^/\\]+$/, "")
            : "C:";
        newPath = `${base}/${r.name}`;
        addError = "";
    }

    async function switchProject(id: string) {
        if (id === currentId) return;
        await fetch("/api/projects/current", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
        });
        window.location.reload();
    }

    async function addProject() {
        const p = newPath.trim();
        if (!p || addLoading) return;
        addLoading = true;
        addError = "";
        try {
            const res = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: p })
            });
            const data = await res.json();
            if (data.error) { addError = data.error; return; }
            window.location.reload();
        } catch (e: any) {
            addError = e.message;
        } finally {
            addLoading = false;
        }
    }

    function cancelAdd() {
        adding = false; newPath = ""; addError = ""; selectedRepo = null; ghRepos = [];
    }

    let settingsOpen = false;
    function toggleSettings() { settingsOpen = !settingsOpen; adding = false; }
    function closeSettings() { settingsOpen = false; }

    function onPathKey(e: KeyboardEvent) {
        if (e.key === "Enter") addProject();
        if (e.key === "Escape") cancelAdd();
    }

    function projectLabel(p: Project) {
        return p.owner && p.repo ? `${p.owner}/${p.repo}` : p.name;
    }
</script>

<header class="topbar">
    <div class="left">

        {#if !adding}
            <!-- Sélecteur de projet -->
            <div class="select-wrap">
                {#if projects.length === 0 && !loadError}
                    <span class="loading-hint">chargement…</span>
                {:else if loadError}
                    <span class="load-error" title={loadError}>⚠ erreur</span>
                {:else}
                    <select
                        class="project-select"
                        on:change={(e) => switchProject((e.target as HTMLSelectElement).value)}
                    >
                        {#each projects as p}
                            <option value={p.id} selected={p.id === currentId}>
                                {projectLabel(p)}
                            </option>
                        {/each}
                    </select>
                    <span class="select-caret">▾</span>
                {/if}
            </div>

            <!-- Bouton ajouter un projet -->
            <button class="add-btn" on:click={openAdd} title="Ajouter un projet">+</button>

            <!-- Bouton paramètres projet -->
            <button
                class="add-btn"
                class:active={settingsOpen}
                on:click={toggleSettings}
                title="Paramètres du projet"
            >⚙</button>

            <!-- Panneau paramètres -->
            {#if settingsOpen}
                <div class="add-panel settings-dropdown">
                    <ProjectSettings />
                </div>
            {/if}

        {:else}
            <!-- Panneau d'ajout (dropdown) -->
            <div class="add-panel">

                <!-- Liste des repos GitHub -->
                <div class="gh-repos">
                    {#if ghLoading}
                        <span class="gh-hint">Chargement des repos…</span>
                    {:else if ghRepos.length === 0}
                        <span class="gh-hint">Aucun repo GitHub détecté</span>
                    {:else}
                        {#each ghRepos as r}
                            <button
                                class="gh-repo-btn"
                                class:selected={selectedRepo?.name === r.name}
                                class:configured={r.configured}
                                on:click={() => !r.configured && selectGhRepo(r)}
                                disabled={r.configured}
                                title={r.configured ? "Déjà configuré" : r.fullName}
                            >
                                <span class="gh-repo-name">{r.fullName}</span>
                                {#if r.configured}
                                    <span class="gh-badge">✓</span>
                                {:else if r.private}
                                    <span class="gh-badge dim">🔒</span>
                                {/if}
                            </button>
                        {/each}
                    {/if}
                </div>

                <!-- Champ chemin local -->
                <div class="add-row">
                    <input
                        class="add-input"
                        placeholder="Chemin local (ex: C:/claudicator)"
                        bind:value={newPath}
                        on:keydown={onPathKey}
                        disabled={addLoading}
                    />
                    <button class="btn-confirm" on:click={addProject} disabled={!newPath.trim() || addLoading}>
                        {addLoading ? "…" : "Ajouter"}
                    </button>
                    <button class="btn-cancel" on:click={cancelAdd}>✕</button>
                </div>

                {#if addError}
                    <span class="add-error">{addError}</span>
                {/if}
            </div>
        {/if}

    </div>

    {#if $projectUsage}
        <span class="usage-total" title="Total projet : {$projectUsage.totalInputTokens.toLocaleString('fr-FR')} in · {$projectUsage.totalOutputTokens.toLocaleString('fr-FR')} out">
            {Math.round(($projectUsage.totalInputTokens + $projectUsage.totalOutputTokens) / 1000)}k tok
        </span>
    {/if}

    <span class="status" data-status={$agentState.status}>
        {statusLabels[$agentState.status]}
    </span>
</header>

<style>
.topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    height: 40px;
    background: #12121a;
    border-bottom: 1px solid #222;
    flex-shrink: 0;
    gap: 0.75rem;
}
.left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
    position: relative;
}

/* ── Select ── */
.select-wrap {
    position: relative;
    display: flex;
    align-items: center;
}
.project-select {
    appearance: none;
    background: #1a1a28;
    border: 1px solid #333;
    border-radius: 4px;
    color: #ccc;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    padding: 0.2rem 1.6rem 0.2rem 0.6rem;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s;
    max-width: 240px;
}
.project-select:hover { border-color: #555; }
.project-select:focus { border-color: #7c6af7; }
.project-select option { background: #1a1a28; color: #ccc; }
.select-caret {
    position: absolute;
    right: 0.45rem;
    font-size: 0.55rem;
    color: #666;
    pointer-events: none;
}
.loading-hint { font-size: 0.7rem; color: #444; font-style: italic; font-family: 'JetBrains Mono', monospace; }
.load-error   { font-size: 0.7rem; color: #f44336; font-family: 'JetBrains Mono', monospace; cursor: help; }

/* ── Bouton + ── */
.add-btn {
    background: none;
    border: 1px solid #333;
    color: #666;
    font-size: 0.9rem;
    line-height: 1;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    flex-shrink: 0;
    transition: color 0.15s, border-color 0.15s;
}
.add-btn:hover { color: #9181f9; border-color: #9181f9; }
.add-btn.active { color: #9181f9; border-color: #7c6af7; }
.settings-dropdown { left: auto; right: 0; min-width: 340px; max-width: 420px; }

/* ── Panneau ajout ── */
.add-panel {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 100;
    background: #0e0e1a;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    min-width: 320px;
    max-width: 420px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.gh-repos {
    max-height: 220px;
    overflow-y: auto;
    padding: 0.3rem 0;
    border-bottom: 1px solid #1e1e2e;
}
.gh-repos::-webkit-scrollbar { width: 3px; }
.gh-repos::-webkit-scrollbar-thumb { background: #2a2a3a; }
.gh-hint {
    display: block;
    padding: 0.4rem 0.8rem;
    font-size: 0.62rem;
    color: #444;
    font-style: italic;
    font-family: 'JetBrains Mono', monospace;
}
.gh-repo-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: none;
    border: none;
    text-align: left;
    padding: 0.3rem 0.8rem;
    cursor: pointer;
    gap: 0.5rem;
    transition: background 0.1s;
}
.gh-repo-btn:hover:not(:disabled) { background: #1a1a2e; }
.gh-repo-btn.selected { background: #1a1a2e; }
.gh-repo-btn.configured { cursor: default; opacity: 0.5; }
.gh-repo-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    color: #aaa;
}
.gh-repo-btn:hover:not(:disabled) .gh-repo-name { color: #ccc; }
.gh-badge { font-size: 0.6rem; color: #4caf50; flex-shrink: 0; }
.gh-badge.dim { color: #555; }
.add-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.45rem 0.6rem;
}
.add-input {
    flex: 1;
    min-width: 0;
    background: #070710;
    border: 1px solid #2a2a3a;
    border-radius: 3px;
    color: #ccc;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.67rem;
    padding: 0.22rem 0.5rem;
    outline: none;
    transition: border-color 0.15s;
}
.add-input:focus { border-color: #7c6af7; }
.add-input::placeholder { color: #333; }
.add-input:disabled { opacity: 0.5; }
.btn-confirm, .btn-cancel {
    background: none;
    border: 1px solid #2a2a3a;
    color: #777;
    font-size: 0.65rem;
    padding: 0.2rem 0.55rem;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    font-family: 'Inter', sans-serif;
    flex-shrink: 0;
}
.btn-confirm:hover:not(:disabled) { border-color: #7c6af7; color: #9181f9; }
.btn-cancel:hover { border-color: #555; color: #aaa; }
.btn-confirm:disabled { opacity: 0.35; cursor: default; }
.add-error {
    font-size: 0.6rem;
    color: #f44336;
    padding: 0 0.8rem 0.4rem;
    font-family: 'JetBrains Mono', monospace;
}

/* ── Usage global ── */
.usage-total {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.62rem;
    color: #2a2a4a;
    flex-shrink: 0;
    cursor: help;
}

/* ── Statut ── */
.status {
    color: #333;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    flex-shrink: 0;
}
.status[data-status="planning"] { color: #f7c948; }
.status[data-status="done"]     { color: #4caf50; }
.status[data-status="error"]    { color: #f44336; }
.status[data-status="loading"]  { color: #666; }
</style>
