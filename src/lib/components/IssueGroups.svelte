<script lang="ts">
    type IssueGroup = {
        keyword: string;
        keywords: string[];
        issues: { number: number; title: string }[];
        score: number;
        hasParent: boolean;
        parentNumber: number | null;
        parentUrl: string | null;
    };

    type Stats = {
        totalIssues: number;
        groupCount: number;
        issuesInGroups: number;
        issuesOutOfGroups: number;
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
        {@const maxScore = groups.length > 0 ? Math.max(...groups.map(g => g.score)) : 0}
        <div class="groups-list">
            {#each groups as group (group.keyword)}
                {@const state = groupState[group.keyword]}
                {@const tier = scoreTier(group.score, maxScore)}
                <div class="group-card" class:has-parent={group.hasParent} data-tier={tier}>
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
                            <li class="group-issue">
                                <span class="issue-num">#{issue.number}</span>
                                <span class="issue-title">{issue.title}</span>
                            </li>
                        {/each}
                    </ul>

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
.stat-parent .stat-val { color: #5a9a5a; }

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
.issue-num {
    color: #5a8a5a;
    flex-shrink: 0;
    min-width: 2.8rem;
}
.issue-title {
    color: var(--text-primary, #ccc);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
