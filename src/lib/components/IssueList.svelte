<script lang="ts">
    import { onMount } from "svelte";
    import { agentState, agentRunState, issueAnalysis, globalPlanPrompt, type Issue } from "$lib/stores/agent";
    import ItemRow from "$lib/components/ItemRow.svelte";

    export let hideHeader = false;

    let issues: Issue[] = [];
    let loading = true;
    let refreshing = false;
    let error = "";
    let hasResult = false;

    $: filteredIssues = issues.filter(i =>
        i.state === "open" && !$agentState.knownSubIssueNumbers.includes(i.number)
    );

    $: diffBadge = (() => {
        const diff = $issueAnalysis.snapshotDiff;
        if (!diff) return null;
        const parts: string[] = [];
        if (diff.added.length)    parts.push(`${diff.added.length} nouvelle${diff.added.length > 1 ? "s" : ""}`);
        if (diff.removed.length)  parts.push(`${diff.removed.length} fermée${diff.removed.length > 1 ? "s" : ""}`);
        if (diff.modified.length) parts.push(`${diff.modified.length} modifiée${diff.modified.length > 1 ? "s" : ""}`);
        return parts.length > 0 ? parts.join(" · ") + " depuis la dernière analyse" : null;
    })();

    async function loadIssues() {
        if (issues.length === 0) loading = true;
        else refreshing = true;
        error = "";
        try {
            const res = await fetch("/api/issues");
            if (!res.ok) throw new Error(await res.text());
            issues = await res.json();
        } catch (e: any) {
            error = e.message ?? "Erreur chargement issues";
        } finally {
            loading = false;
            refreshing = false;
        }
    }

    async function loadSnapshot() {
        try {
            const res = await fetch("/api/issues/snapshot");
            if (!res.ok) return;
            const { snapshot, hasResult: hr } = await res.json();
            hasResult = hr;
            if (!snapshot) return;

            // Attendre que les issues soient chargées
            await new Promise<void>(resolve => {
                if (!loading) { resolve(); return; }
                const unsub = agentRunState.subscribe(() => {});
                const check = setInterval(() => { if (!loading) { clearInterval(check); unsub(); resolve(); } }, 100);
            });

            const snapshotNums = new Set(snapshot.map((s: any) => s.number));
            const snapshotMap  = new Map(snapshot.map((s: any) => [s.number, s.updatedAt]));
            const currentNums  = new Set(issues.map((i: Issue) => i.number));
            const currentMap   = new Map(issues.map((i: Issue) => [i.number, i.created]));

            const added    = issues.filter(i => !snapshotNums.has(i.number)).map(i => i.number);
            const removed  = snapshot.filter((s: any) => !currentNums.has(s.number)).map((s: any) => s.number);
            const modified = issues
                .filter(i => snapshotNums.has(i.number) && i.created > (snapshotMap.get(i.number) ?? ""))
                .map(i => i.number);

            issueAnalysis.update(s => ({ ...s, snapshotDiff: { added, removed, modified } }));
        } catch { /* silencieux */ }
    }

    onMount(async () => {
        await loadIssues();
        await loadSnapshot();
        if (hasResult) await openAnalysis();
    });

    async function openAnalysis() {
        if ($issueAnalysis.dismissed) return;
        try {
            const r = await fetch("/api/issues/analysis");
            if (r.ok) {
                const text = await r.text();
                if (text.trim()) issueAnalysis.update(s => ({ ...s, result: text }));
            }
        } catch { /* silencieux */ }
    }

    async function startUpdate() {
        issueAnalysis.update(s => ({ ...s, updating: true, dismissed: false, logs: [] }));
        try {
            const res = await fetch("/api/issues/analyze/update", { method: "POST" });
            if (!res.ok || !res.body) {
                issueAnalysis.update(s => ({ ...s, updating: false }));
                return;
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const parts = buf.split("\n\n");
                buf = parts.pop() ?? "";
                for (const part of parts) {
                    if (!part.startsWith("data:")) continue;
                    try {
                        const { line, type } = JSON.parse(part.slice(5).trim());
                        issueAnalysis.update(s => ({ ...s, logs: [...s.logs, { line, type }] }));
                    } catch { /* ignore */ }
                }
            }
        } finally {
            try {
                const r = await fetch("/api/issues/snapshot");
                if (r.ok) {
                    const { hasResult: hr } = await r.json();
                    hasResult = hr;
                }
                if (hasResult) {
                    const r2 = await fetch("/api/issues/analysis");
                    if (r2.ok) {
                        const text = await r2.text();
                        issueAnalysis.update(s => ({ ...s, updating: false, result: text, snapshotDiff: null }));
                        return;
                    }
                }
            } catch { /* silencieux */ }
            issueAnalysis.update(s => ({ ...s, updating: false }));
        }
    }

    async function startAnalysis() {
        issueAnalysis.update(s => ({ ...s, running: true, dismissed: false, logs: [], result: null }));
        try {
            const res = await fetch("/api/issues/analyze", { method: "POST" });
            if (!res.ok || !res.body) {
                issueAnalysis.update(s => ({ ...s, running: false }));
                return;
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const parts = buf.split("\n\n");
                buf = parts.pop() ?? "";
                for (const part of parts) {
                    if (!part.startsWith("data:")) continue;
                    try {
                        const { line, type } = JSON.parse(part.slice(5).trim());
                        issueAnalysis.update(s => ({ ...s, logs: [...s.logs, { line, type }] }));
                    } catch { /* ignore */ }
                }
            }
        } finally {
            // Charger le résultat depuis le serveur
            try {
                const r = await fetch("/api/issues/snapshot");
                if (r.ok) {
                    const { hasResult: hr } = await r.json();
                    hasResult = hr;
                }
                if (hasResult) {
                    const r2 = await fetch("/api/issues/analysis");
                    if (r2.ok) {
                        const text = await r2.text();
                        issueAnalysis.update(s => ({ ...s, running: false, result: text, snapshotDiff: null }));
                        return;
                    }
                }
            } catch { /* silencieux */ }
            issueAnalysis.update(s => ({ ...s, running: false }));
        }
    }

    function buildGlobalPlan() {
        const issue = $agentState.issue;
        if (!issue) return;
        const parts: string[] = [`ISSUES À PLANIFIER\n`];
        parts.push(`#${issue.number} — ${issue.title}\n${issue.body ?? ""}\n`);
        for (const sub of issue.subIssues ?? []) {
            parts.push(`#${sub.number} — ${sub.title}\n${sub.body ?? ""}\n`);
        }
        globalPlanPrompt.set(parts.join("\n---\n\n"));
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
    {#if !hideHeader}
    <div class="panel-header">
        <span>Issues {#if refreshing}<span class="refreshing">↻</span>{/if}</span>
        <div class="header-actions">
            {#if hasResult && !$issueAnalysis.running}
                <button class="plan-btn" onclick={() => { issueAnalysis.update(s => ({ ...s, dismissed: false })); openAnalysis(); }} title="Voir la roadmap">
                    ⊟ Roadmap
                </button>
            {/if}
        </div>
    </div>
    {/if}
    {#if diffBadge}
        <div class="diff-badge">
            <span>⚠ {diffBadge}</span>
            {#if hasResult && !$issueAnalysis.running && !$issueAnalysis.updating && ($issueAnalysis.snapshotDiff?.added.length || $issueAnalysis.snapshotDiff?.modified.length)}
                <button class="integrate-btn" onclick={startUpdate} title="Intégrer les nouvelles issues dans l'analyse">
                    ⊕ Intégrer
                </button>
            {/if}
        </div>
    {/if}

    {#if $agentState.issue?.subIssues?.length}
        <div class="global-plan-bar">
            <span class="gp-label">#{$agentState.issue.number} + {$agentState.issue.subIssues.length} sub-issue{$agentState.issue.subIssues.length > 1 ? "s" : ""}</span>
            <button class="gp-btn" onclick={buildGlobalPlan}>Plan global</button>
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
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.header-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
}
.analyze-btn {
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
.analyze-btn:hover:not(:disabled) { color: var(--accent-hover); border-color: var(--accent-hover); }
.analyze-btn:disabled { opacity: 0.35; cursor: default; }
.plan-btn {
    background: none;
    border: 1px solid #2a2a4a;
    color: #4a4a7a;
    font-size: 0.62rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: color 0.15s, border-color 0.15s;
}
.plan-btn:hover { color: var(--accent-hover); border-color: var(--accent-hover); }
.diff-badge {
    padding: 0.25rem 0.75rem;
    font-size: 0.6rem;
    color: #b8860b;
    background: #1a1500;
    border-bottom: 1px solid #2a2000;
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
}
.integrate-btn {
    background: none;
    border: 1px solid #3a2a00;
    color: #8a6a00;
    font-size: 0.58rem;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
}
.integrate-btn:hover { color: #f0c040; border-color: #8a6a00; }
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
.error { padding: 1rem; color: #f44336; font-size: 0.8rem; }
.refreshing { font-size: 0.65rem; color: #444; margin-left: 0.3rem; animation: spin 1s linear infinite; display: inline-block; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.global-plan-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.75rem;
    background: #0d1520;
    border-bottom: 1px solid #1a2a3a;
    flex-shrink: 0;
    gap: 0.5rem;
}
.gp-label {
    font-size: 0.58rem;
    font-family: 'JetBrains Mono', monospace;
    color: #4a6a8a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.gp-btn {
    background: none;
    border: 1px solid #1a3a5a;
    color: #3a6a9a;
    font-size: 0.58rem;
    padding: 0.1rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    white-space: nowrap;
    flex-shrink: 0;
    transition: color 0.15s, border-color 0.15s;
}
.gp-btn:hover { color: var(--accent-hover); border-color: var(--accent-hover); }
</style>
