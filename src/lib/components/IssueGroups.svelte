<script lang="ts">
    import { agentState } from "$lib/stores/agent";

    type IssueGroup = {
        keyword: string;
        keywords: string[];
        issues: { number: number; title: string }[];
        score: number;
        hasParent: boolean;
        parentNumber: number | null;
        parentUrl: string | null;
        twins: number[][];
        subdivisions: { keyword: string; keywords: string[]; issues: { number: number; title: string }[] }[];
    };

    type Stats = {
        totalIssues: number;
        groupCount: number;
        issuesInGroups: number;
        issuesOutOfGroups: number;
        ungroupedClusterCount: number;
        groupsWithParent: number;
    };

    type CreatedParent = {
        parentNumber: number;
        title: string;
        html_url: string;
    };

    let groups: IssueGroup[] = $state([]);
    let stats: Stats | null = $state(null);
    let loading = $state(false);
    let error = $state("");

    let ungroupedClusters: IssueGroup[] = $state([]);
    let ungroupedIssues: { number: number; title: string }[] = $state([]);
    let haikus: Record<string, { title: string; description: string; err?: string }> = $state({});
    let haikuLoading = $state(false);

    let groupState: Record<string, { creating: boolean; created: CreatedParent | null; err: string }> = $state({});

    async function loadGroups(min = 3) {
        loading = true;
        error = "";
        try {
            const r = await fetch(`/api/issues/groups?min=${min}`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            groups = data.groups ?? data; // compat si ancien format
            stats  = data.stats ?? null;
            ungroupedClusters = data.ungroupedClusters ?? [];
            ungroupedIssues = data.ungroupedIssues ?? [];
            const st: typeof groupState = {};
            for (const g of groups) {
                st[g.keyword] = { creating: false, created: null, err: "" };
            }
            groupState = st;
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            loading = false;
        }
    }

    async function createParent(group: IssueGroup) {
        const key = group.keyword;
        groupState = { ...groupState, [key]: { creating: true, created: null, err: "" } };
        try {
            const r = await fetch("/api/issues/group-parent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    keyword: group.keyword,
                    issueNumbers: group.issues.map(i => i.number)
                })
            });
            if (!r.ok) {
                const msg = await r.text();
                throw new Error(msg || `HTTP ${r.status}`);
            }
            const data = await r.json();
            groupState = {
                ...groupState,
                [key]: {
                    creating: false,
                    created: { parentNumber: data.parentNumber, title: data.title, html_url: data.html_url },
                    err: ""
                }
            };
            groups = groups.map(g => g.keyword === key ? { ...g, hasParent: true, parentNumber: data.parentNumber, parentUrl: data.html_url } : g);
        } catch (e) {
            groupState = {
                ...groupState,
                [key]: { creating: false, created: null, err: e instanceof Error ? e.message : String(e) }
            };
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
                    }))
                })
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            haikus = data.haikus ?? {};
        } finally {
            haikuLoading = false;
        }
    }

    /** Tier de score : "hot" | "warm" | "cool" */
    function scoreTier(score: number, maxScore: number): string {
        const ratio = maxScore > 0 ? score / maxScore : 0;
        if (ratio >= 0.7) return "hot";
        if (ratio >= 0.35) return "warm";
        return "cool";
    }

    $effect(() => {
        loadGroups();
    });
</script>

<div class="groups-panel">
    <!-- Header avec stats -->
    <div class="groups-header">
        <span class="groups-title">Regroupements</span>
        <button class="btn-refresh" onclick={() => loadGroups()} disabled={loading} title="Actualiser">
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

        {@const maxScore = groups.length > 0 ? Math.max(...groups.map(g => g.score)) : 0}
        <div class="groups-list">
            {#each groups as group (group.keyword)}
                {@const state = groupState[group.keyword]}
                {@const tier = scoreTier(group.score, maxScore)}
                {@const haiku = haikus[group.keyword]}
                {@const twinNums = new Set((group.twins ?? []).flat())}
                <div class="group-card" class:has-parent={group.hasParent} data-tier={tier}>
                    {#if haiku && !haiku.err}
                        <div class="group-haiku">
                            <span class="haiku-title">{haiku.title}</span>
                            <span class="haiku-desc">{haiku.description}</span>
                        </div>
                    {/if}

                    <div class="group-head">
                        <span class="score-badge" data-tier={tier} title="Score de concentration : {group.score.toFixed(1)}">
                            {#if tier === "hot"}●●●{:else if tier === "warm"}●●○{:else}●○○{/if}
                        </span>
                        <span class="group-keyword">{group.keyword}</span>
                        {#if group.keywords.length > 1}
                            <span class="group-extra-kw">+{group.keywords.slice(1).join(", ")}</span>
                        {/if}
                        <span class="group-count">{group.issues.length} issues</span>
                    </div>

                    <ul class="group-issues">
                        {#each group.issues as issue}
                            <li class="group-issue" class:is-twin={twinNums.has(issue.number)}>
                                <button class="issue-num" onclick={() => openIssue(issue.number)}>
                                    #{issue.number}
                                </button>
                                <span class="issue-title">{issue.title}</span>
                                {#if twinNums.has(issue.number)}
                                    <span class="twin-badge" title="Sujet identique">⇔</span>
                                {/if}
                            </li>
                        {/each}
                    </ul>

                    {#if (group.subdivisions ?? []).length > 0}
                        <details class="group-subdivisions">
                            <summary>Subdivisions possibles ({group.subdivisions.length})</summary>
                            {#each group.subdivisions as sub}
                                <div class="sub-group">
                                    <span class="sub-keyword">{sub.keyword}</span>
                                    <span class="sub-count">{sub.issues.length} issues</span>
                                    <ul class="sub-issues">
                                        {#each sub.issues as issue}
                                            <li>
                                                <button class="issue-num" onclick={() => openIssue(issue.number)}>
                                                    #{issue.number}
                                                </button>
                                                {issue.title}
                                            </li>
                                        {/each}
                                    </ul>
                                </div>
                            {/each}
                        </details>
                    {/if}

                    <div class="group-footer">
                        {#if state?.created}
                            <a class="created-link" href={state.created.html_url} target="_blank" rel="noopener">
                                ✓ #{state.created.parentNumber} — {state.created.title}
                            </a>
                        {:else if group.hasParent}
                            {#if group.parentUrl}
                                <a class="parent-link" href={group.parentUrl} target="_blank" rel="noopener">
                                    ⊃ #{group.parentNumber} Issue parente
                                </a>
                            {:else}
                                <span class="has-parent-label">Issue parente existante</span>
                            {/if}
                        {:else}
                            <button
                                class="btn-create-parent"
                                onclick={() => createParent(group)}
                                disabled={state?.creating}
                            >
                                {state?.creating ? "Génération…" : "Créer issue parente"}
                            </button>
                            {#if state?.err}
                                <span class="group-err">{state.err}</span>
                            {/if}
                        {/if}
                    </div>
                </div>
            {/each}

            {#if ungroupedClusters.length > 0}
                <div class="ungrouped-section-label">
                    <span>∿ clusters hors-groupe</span>
                    <span class="ugc-count">{ungroupedClusters.length}</span>
                </div>
                {#each ungroupedClusters as cluster (cluster.keyword)}
                    <div class="group-card ungrouped-cluster-card">
                        <div class="group-head">
                            <span class="score-badge ugc-dot">◌</span>
                            <span class="group-keyword ugc-kw">~{cluster.keyword}</span>
                            {#if cluster.keywords.length > 1}
                                <span class="group-extra-kw">+{cluster.keywords.slice(1).join(", ")}</span>
                            {/if}
                            <span class="group-count">{cluster.issues.length} issues</span>
                        </div>
                        <ul class="group-issues">
                            {#each cluster.issues as issue}
                                <li class="group-issue">
                                    <button class="issue-num" onclick={() => openIssue(issue.number)}>
                                        #{issue.number}
                                    </button>
                                    <span class="issue-title">{issue.title}</span>
                                </li>
                            {/each}
                        </ul>
                    </div>
                {/each}
            {/if}

            {#if ungroupedIssues.length > 0}
                <div class="group-card ungrouped-card">
                    <div class="group-head">
                        <span class="group-keyword ungrouped-kw">isolées</span>
                        <span class="group-count">{ungroupedIssues.length} issues</span>
                    </div>
                    <ul class="group-issues">
                        {#each ungroupedIssues as issue}
                            <li class="group-issue">
                                <button class="issue-num" onclick={() => openIssue(issue.number)}>
                                    #{issue.number}
                                </button>
                                <span class="issue-title">{issue.title}</span>
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
.groups-stats {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.1rem 0.3rem;
    border-bottom: 1px solid var(--border, #222);
    flex-wrap: wrap;
}
.stat-item {
    display: flex;
    align-items: baseline;
    gap: 0.2rem;
}
.stat-val {
    font-size: 0.72rem;
    font-weight: bold;
    color: #aaa;
}
.stat-lbl {
    font-size: 0.55rem;
    color: #555;
}
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

/* ── Liste ── */
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

/* ── Card ── */
.group-card {
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    padding: 0.45rem 0.55rem;
    background: var(--bg-panel, #0e0e1a);
}
.group-card.has-parent {
    border-color: #2a3a2a;
    opacity: 0.75;
}
/* Teintes selon tier */
.group-card[data-tier="hot"]  { border-color: #3a2a5a; }
.group-card[data-tier="warm"] { border-color: #2a2a4a; }

/* Hors-groupes isolées */
.ungrouped-card {
    border-color: #222;
    opacity: 0.55;
}
.ungrouped-kw {
    color: #666;
    background: #0d0d0d;
    border-color: #2a2a2a;
}

/* Section label clusters hors-groupe */
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

/* Cartes de clusters hors-groupe */
.ungrouped-cluster-card {
    border-color: #252535;
    background: #0c0c18;
    opacity: 0.85;
}
.ugc-dot {
    color: #3a3a5a;
    font-size: 0.6rem;
}
.ugc-kw {
    color: #7a6ab9;
    background: #12102a;
    border-color: #353260;
}

/* ── Haïku par groupe ── */
.group-haiku {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    margin-bottom: 0.35rem;
    padding: 0.25rem 0.4rem;
    border-left: 2px solid #4a3a8a;
    background: #0d0a1f;
}
.haiku-title { font-size: 0.68rem; color: #b09af9; font-weight: bold; }
.haiku-desc  { font-size: 0.58rem; color: #888; }

.group-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.3rem;
}

/* ── Score badge ── */
.score-badge {
    font-size: 0.55rem;
    letter-spacing: -0.05em;
    flex-shrink: 0;
}
.score-badge[data-tier="hot"]  { color: #c07af9; }
.score-badge[data-tier="warm"] { color: #7a8af9; }
.score-badge[data-tier="cool"] { color: #444; }

.group-keyword {
    font-size: 0.7rem;
    font-weight: bold;
    color: #9181f9;
    background: #1a1040;
    border: 1px solid #4a3a8a;
    border-radius: 3px;
    padding: 0.05rem 0.35rem;
}
.group-card[data-tier="hot"] .group-keyword {
    color: #c07af9;
    border-color: #6a3aaa;
    background: #1e0a40;
}
.group-extra-kw {
    font-size: 0.58rem;
    color: var(--text-muted, #888);
}
.group-count {
    margin-left: auto;
    font-size: 0.58rem;
    color: var(--text-muted, #888);
}

/* ── Issues ── */
.group-issues {
    list-style: none;
    padding: 0;
    margin: 0 0 0.35rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
}
.group-issue {
    display: flex;
    gap: 0.3rem;
    align-items: baseline;
    font-size: 0.6rem;
}
.group-issue.is-twin { background: #0a0a18; border-radius: 2px; }

/* issue-num cliquable */
.issue-num {
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
.issue-num:hover { color: #7aba7a; text-decoration: underline; }

.issue-title {
    color: var(--text-primary, #ccc);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Jumeaux */
.twin-badge { font-size: 0.55rem; color: #6a5a9a; margin-left: auto; }

/* ── Subdivisions ── */
.group-subdivisions { margin-top: 0.35rem; margin-bottom: 0.2rem; }
.group-subdivisions summary {
    font-size: 0.58rem;
    color: #777;
    cursor: pointer;
    padding: 0.15rem 0;
}
.sub-group {
    padding: 0.25rem 0.35rem;
    border-left: 1px solid #2a2a4a;
    margin-top: 0.2rem;
}
.sub-keyword {
    font-size: 0.62rem;
    color: #7a6ad9;
    background: #140f30;
    border: 1px solid #3a2a7a;
    border-radius: 3px;
    padding: 0.02rem 0.3rem;
}
.sub-count { font-size: 0.55rem; color: #555; margin-left: 0.3rem; }
.sub-issues {
    list-style: none;
    padding: 0;
    margin: 0.15rem 0 0 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: 0.58rem;
    color: #aaa;
}

/* ── Footer ── */
.group-footer {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.2rem;
}
.btn-create-parent {
    background: #0a1a0a;
    border: 1px solid #2a5a2a;
    color: #5a9a5a;
    font-size: 0.62rem;
    padding: 0.15rem 0.55rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.12s, color 0.12s;
}
.btn-create-parent:hover:not(:disabled) { background: #0e2a0e; color: #7aba7a; }
.btn-create-parent:disabled { opacity: 0.5; cursor: default; }
.created-link {
    font-size: 0.62rem;
    color: #5a9a5a;
    text-decoration: none;
}
.created-link:hover { text-decoration: underline; }
.parent-link {
    font-size: 0.62rem;
    color: #5a8a9a;
    text-decoration: none;
}
.parent-link:hover { text-decoration: underline; color: #7aaaba; }
.has-parent-label {
    font-size: 0.58rem;
    color: var(--text-muted, #888);
}
.group-err {
    font-size: 0.58rem;
    color: #e05a5a;
}
</style>
