<script lang="ts">
    import { agentState, issueGroupsCache } from "$lib/stores/agent";
    import { get } from "svelte/store";
    import IssueGroupCard from "./IssueGroupCard.svelte";
    import type { IssueGroup, Stats } from "./IssueGroups.helpers";

    let {
        selectedGroupKeyword = null,
        onGroupSelect,
    }: {
        selectedGroupKeyword?: string | null;
        onGroupSelect?: (kw: string | null) => void;
    } = $props();

    let groups: IssueGroup[] = $state([]);
    let stats: Stats | null = $state(null);
    let loading = $state(false);
    let error = $state("");

    let ungroupedClusters: IssueGroup[] = $state([]);
    let ungroupedIssues: { number: number; title: string }[] = $state([]);
    let haikus: Record<string, { title: string; description: string; err?: string }> = $state({});
    let haikuLoading = $state(false);

    const sortedGroups = $derived([
        ...groups.filter(g => (g.subdivisions ?? []).length > 0),
        ...groups.filter(g => (g.subdivisions ?? []).length === 0),
    ]);

    const maxScore = $derived(groups.length > 0 ? Math.max(...groups.map(g => g.score)) : 0);

    function applySnapshot(data: { groups?: any[]; ungroupedClusters?: any[]; ungroupedIssues?: any[]; stats?: any }) {
        groups = data.groups ?? [];
        stats = data.stats ?? null;
        ungroupedClusters = data.ungroupedClusters ?? [];
        ungroupedIssues = data.ungroupedIssues ?? [];
    }

    async function loadGroups(min = 3, force = false) {
        const cached = get(issueGroupsCache);
        if (!force && cached) {
            applySnapshot(cached);
            return;
        }
        loading = true;
        error = "";
        try {
            const r = await fetch(`/api/issues/groups?min=${min}`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            applySnapshot(data);
            issueGroupsCache.set({ groups, ungroupedClusters, ungroupedIssues, stats });
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            loading = false;
        }
    }

    async function generateHaikus() {
        haikuLoading = true;
        try {
            const r = await fetch("/api/issues/groups/haikus", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    groups: groups.map(g => ({
                        keyword: g.keyword,
                        keywords: g.keywords,
                        issueTitles: g.issues.map(i => i.title)
                    })),
                    subdivisions: groups.flatMap(g => (g.subdivisions ?? []).map(s => ({
                        keyword: s.keyword,
                        keywords: s.keywords,
                        issueTitles: s.issues.map(i => i.title)
                    })))
                })
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            haikus = data.haikus ?? {};
        } finally {
            haikuLoading = false;
        }
    }

    async function openIssue(n: number) {
        agentState.update(s => ({ ...s, status: "loading", plan: null }));
        try {
            const res = await fetch(`/api/issue?number=${n}`);
            if (!res.ok) return;
            const full = await res.json();
            agentState.update(s => ({
                ...s, issue: full, status: "idle", navigationStack: [],
                knownSubIssueNumbers: [...new Set([
                    ...s.knownSubIssueNumbers,
                    ...(full.subIssues?.map((si: any) => si.number) ?? [])
                ])]
            }));
        } catch {
            agentState.update(s => ({ ...s, status: "idle" }));
        }
    }

    $effect(() => {
        loadGroups(3, false);
    });
</script>

<div class="groups-panel">
    <div class="groups-header">
        <span class="groups-title">Regroupements</span>
        <button class="btn-refresh" onclick={() => loadGroups(3, true)} disabled={loading} title="Actualiser">
            {loading ? "…" : "↻"}
        </button>
    </div>

    {#if stats}
        <div class="groups-stats">
            <span class="stat-item" title="Groupes détectés">
                <span class="stat-val">{stats.groupCount}</span>
                <span class="stat-lbl">groupes</span>
            </span>
            <span class="stat-sep">·</span>
            <span class="stat-item" title="Issues appartenant à au moins un groupe">
                <span class="stat-val">{stats.issuesInGroups}</span>
                <span class="stat-lbl">en groupe</span>
            </span>
            {#if stats.issuesOutOfGroups > 0}
                <span class="stat-sep">·</span>
                <span class="stat-item stat-out" title="Issues hors groupe">
                    <span class="stat-val">{stats.issuesOutOfGroups}</span>
                    <span class="stat-lbl">hors groupe</span>
                </span>
            {/if}
            {#if stats.ungroupedClusterCount > 0}
                <span class="stat-sep">·</span>
                <span class="stat-item stat-ugc" title="Clusters sémantiques parmi les hors-groupes">
                    <span class="stat-val">∿{stats.ungroupedClusterCount}</span>
                    <span class="stat-lbl">clusters</span>
                </span>
            {/if}
            {#if stats.groupsWithParent > 0}
                <span class="stat-sep">·</span>
                <span class="stat-item stat-parent" title="Groupes avec issue parente">
                    <span class="stat-val">{stats.groupsWithParent}</span>
                    <span class="stat-lbl">parentés</span>
                </span>
            {/if}
        </div>
    {/if}

    {#if loading}
        <div class="groups-empty">Analyse des regroupements…</div>
    {:else if error}
        <div class="groups-error">{error}</div>
    {:else if groups.length === 0}
        <div class="groups-empty">Aucun regroupement détecté.</div>
    {:else}
        <div class="haiku-cta">
            <button class="btn-haiku" onclick={generateHaikus} disabled={haikuLoading || groups.length === 0}>
                {haikuLoading ? "Génération…" : "✦ Générer les haïkus"}
            </button>
        </div>

        <div class="groups-list">
            {#each sortedGroups as group (group.keyword)}
                <IssueGroupCard
                    {group}
                    haiku={haikus[group.keyword]}
                    isSelected={group.keyword === selectedGroupKeyword}
                    {maxScore}
                    {onGroupSelect}
                />
            {/each}

            {#if ungroupedClusters.length > 0}
                <div class="ungrouped-section-label">
                    <span>∿ clusters hors-groupe</span>
                    <span class="ugc-count">{ungroupedClusters.length}</span>
                </div>
                {#each ungroupedClusters as cluster (cluster.keyword)}
                    <div class="ugc-card">
                        <div class="ugc-head">
                            <span class="ugc-dot">◌</span>
                            <span class="ugc-kw">~{cluster.keyword}</span>
                            {#if cluster.keywords.length > 1}
                                <span class="ugc-extra">+{cluster.keywords.slice(1).join(", ")}</span>
                            {/if}
                            <span class="ugc-count-inline">{cluster.issues.length} issues</span>
                        </div>
                        <ul class="ugc-issues">
                            {#each cluster.issues as issue}
                                <li class="ugc-issue">
                                    <button class="ugc-num" onclick={() => openIssue(issue.number)}>
                                        #{issue.number}
                                    </button>
                                    <span class="ugc-title">{issue.title}</span>
                                </li>
                            {/each}
                        </ul>
                    </div>
                {/each}
            {/if}

            {#if ungroupedIssues.length > 0}
                <div class="isolated-card">
                    <div class="ugc-head">
                        <span class="isolated-kw">isolées</span>
                        <span class="ugc-count-inline">{ungroupedIssues.length} issues</span>
                    </div>
                    <ul class="ugc-issues">
                        {#each ungroupedIssues as issue}
                            <li class="ugc-issue">
                                <button class="ugc-num" onclick={() => openIssue(issue.number)}>
                                    #{issue.number}
                                </button>
                                <span class="ugc-title">{issue.title}</span>
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
.groups-panel {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.5rem 0.7rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--text-primary, #ccc);
    height: 100%;
    overflow-y: auto;
}
.groups-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    border-bottom: 1px solid var(--border, #333);
    padding-bottom: 0.3rem;
}
.groups-title {
    font-size: 0.62rem;
    color: var(--text-muted, #888);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex: 1;
}
.btn-refresh {
    background: none;
    border: none;
    color: var(--text-muted, #888);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0 0.2rem;
    line-height: 1;
}
.btn-refresh:hover:not(:disabled) { color: var(--accent, #9181f9); }
.btn-refresh:disabled { opacity: 0.4; cursor: default; }

/* ── Stats ── */
.groups-stats { display: flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.1rem 0.3rem; border-bottom: 1px solid var(--border, #222); flex-wrap: wrap; }
.stat-item { display: flex; align-items: baseline; gap: 0.2rem; }
.stat-val { font-size: 0.72rem; font-weight: bold; color: #aaa; }
.stat-lbl { font-size: 0.55rem; color: #555; }
.stat-sep { color: #333; font-size: 0.6rem; }
.stat-out .stat-val { color: #777; }
.stat-ugc .stat-val { color: #5a5a8a; }
.stat-parent .stat-val { color: #5a9a5a; }

/* ── Haïku CTA ── */
.haiku-cta { padding: 0.3rem 0; }
.btn-haiku {
    background: none;
    border: 1px solid #3a2a5a;
    color: #9181f9;
    font-size: 0.62rem;
    padding: 0.2rem 0.7rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
}
.btn-haiku:hover:not(:disabled) { background: #1a1040; }
.btn-haiku:disabled { opacity: 0.4; cursor: default; }

/* ── États vides / erreur ── */
.groups-empty, .groups-error {
    color: var(--text-muted, #888);
    font-size: 0.62rem;
    padding: 0.4rem 0;
}
.groups-error { color: #e05a5a; }
.groups-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

/* ── Section clusters hors-groupe ── */
.ungrouped-section-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.55rem;
    color: #4a4a6a;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.3rem 0.1rem 0.1rem;
    border-top: 1px solid #1e1e2a;
    margin-top: 0.2rem;
}
.ugc-count {
    background: #1a1a2a;
    color: #5a5a8a;
    border-radius: 3px;
    padding: 0 0.3rem;
    font-size: 0.58rem;
}

/* ── Cartes ungrouped / isolated ── */
.ugc-card {
    border: 1px solid #252535;
    border-radius: 4px;
    padding: 0.45rem 0.55rem;
    background: #0c0c18;
    opacity: 0.85;
}
.isolated-card {
    border: 1px solid #222;
    border-radius: 4px;
    padding: 0.45rem 0.55rem;
    background: var(--bg-panel, #0e0e1a);
    opacity: 0.55;
}
.ugc-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.3rem;
}
.ugc-dot { color: #3a3a5a; font-size: 0.6rem; flex-shrink: 0; }
.ugc-kw {
    font-size: 0.7rem;
    font-weight: bold;
    color: #7a6ab9;
    background: #12102a;
    border: 1px solid #353260;
    border-radius: 3px;
    padding: 0.05rem 0.35rem;
}
.isolated-kw {
    font-size: 0.7rem;
    font-weight: bold;
    color: #666;
    background: #0d0d0d;
    border: 1px solid #2a2a2a;
    border-radius: 3px;
    padding: 0.05rem 0.35rem;
}
.ugc-extra { font-size: 0.58rem; color: var(--text-muted, #888); }
.ugc-count-inline { margin-left: auto; font-size: 0.58rem; color: var(--text-muted, #888); }
.ugc-issues {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
}
.ugc-issue { display: flex; gap: 0.3rem; align-items: baseline; font-size: 0.6rem; }
.ugc-num {
    background: none;
    border: none;
    padding: 0;
    color: #5a8a5a;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    cursor: pointer;
    flex-shrink: 0;
    min-width: 2.8rem;
    text-align: left;
}
.ugc-num:hover { color: #7aba7a; text-decoration: underline; }
.ugc-title {
    color: var(--text-primary, #ccc);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
