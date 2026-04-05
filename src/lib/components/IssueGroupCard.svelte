<script lang="ts">
    import { agentState, agentRunState, startConsoleStream, consoleTab, activeFullPlan, evalIssueDag, evalIssueDagsByKeyword, planPanelActiveTab, doneTasksByIssue, taskIssueNumbers } from "$lib/stores/agent";
    import { get } from "svelte/store";
    import { scoreTier, depsToRoadmapData } from "./IssueGroups.helpers";
    import type { IssueGroup, CreatedParent } from "./IssueGroups.helpers";

    let {
        group,
        haiku = undefined,
        isSelected = false,
        maxScore,
        onGroupSelect,
    }: {
        group: IssueGroup;
        haiku?: { title: string; description: string; err?: string };
        isSelected?: boolean;
        maxScore: number;
        onGroupSelect?: (kw: string | null) => void;
    } = $props();

    // ── État création issue parente ─────────────────────────────────────────
    let creating = $state(false);
    let created: CreatedParent | null = $state(null);
    let createErr = $state("");

    // ── État plan complet ───────────────────────────────────────────────────
    let fullPlanPlanning = $state(false);
    let fullPlanFeedback = $state("");

    // ── État évaluation ─────────────────────────────────────────────────────
    let evalLoading = $state(false);
    let evalResult = $state("");
    let evalErr = $state("");
    let evalOpen = $state(false);

    // ── État suppression tâches effectuées ──────────────────────────────────
    let deletingDone = $state(false);
    let doneCount = $derived(group.issues.filter(i => $doneTasksByIssue.has(i.number)).length);

    const tier = $derived(scoreTier(group.score, maxScore));
    const twinNums = $derived(new Set((group.twins ?? []).flat()));

    async function createParent() {
        creating = true;
        created = null;
        createErr = "";
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
            created = { parentNumber: data.parentNumber, title: data.title, html_url: data.html_url };
        } catch (e) {
            createErr = e instanceof Error ? e.message : String(e);
        } finally {
            creating = false;
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

    async function evaluateGroup() {
        evalLoading = true;
        evalResult = "";
        evalErr = "";
        evalOpen = true;
        try {
            const r = await fetch("/api/issues/groups/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    keyword: group.keyword,
                    issues: group.issues,
                    subdivisions: group.subdivisions ?? []
                })
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);

            const reader = r.body!.getReader();
            const decoder = new TextDecoder();
            let buf = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const parts = buf.split("\n\n");
                buf = parts.pop() ?? "";
                for (const part of parts) {
                    const dataLine = part.split("\n").find(l => l.startsWith("data: "));
                    if (!dataLine) continue;
                    try {
                        const event = JSON.parse(dataLine.slice(6));
                        if (event.type === "agent" && event.line) {
                            evalResult += event.line;
                        }
                        if (event.type === "system" && event.line === "[deps]" && event.data) {
                            const d = event.data as { deps?: { from: number; to: number[] }[]; complexity?: Record<string, string> };
                            const roadmapData = depsToRoadmapData(group.issues, d.deps ?? [], d.complexity ?? {});
                            evalIssueDag.set(roadmapData);
                            evalIssueDagsByKeyword.update(m => ({ ...m, [group.keyword]: roadmapData }));
                            planPanelActiveTab.set("clusters");
                        }
                        if (event.type === "system" && event.line === "[done]") {
                            evalLoading = false;
                        }
                        if (event.type === "error") {
                            evalErr = event.line;
                            evalLoading = false;
                        }
                    } catch { /* ligne non-JSON */ }
                }
            }
            evalLoading = false;
        } catch (e) {
            evalErr = e instanceof Error ? e.message : String(e);
            evalLoading = false;
        }
    }

    async function planFullStack() {
        const done = get(doneTasksByIssue);
        const pendingIssues = group.issues.filter(i => !done.has(i.number));
        const skippedCount = group.issues.length - pendingIssues.length;

        if (pendingIssues.length === 0) {
            fullPlanFeedback = `✓ Toutes les issues sont déjà effectuées (${skippedCount} ignorées)`;
            return;
        }

        fullPlanPlanning = true;
        fullPlanFeedback = skippedCount > 0 ? `${skippedCount} issue(s) déjà effectuée(s) ignorée(s)` : "";

        activeFullPlan.set({ id: "", keyword: group.keyword, status: "generating" });
        agentRunState.update(s => ({
            ...s,
            running: true,
            logs: [],
            taskId: null,
            taskTitle: `Plan complet — ${group.keyword}${skippedCount > 0 ? ` (${pendingIssues.length}/${group.issues.length} issues)` : ""}`,
        }));
        consoleTab.set("console");

        try {
            const r = await fetch("/api/issues/groups/stack-plan-full", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    groupKeyword: group.keyword,
                    subStacks: [{ keyword: group.keyword, issues: pendingIssues }],
                    residualIssues: []
                })
            });

            await startConsoleStream(r, {
                onEvent: (event: any) => {
                    if (event.type === "system" && event.line === "[planId]" && event.planId) {
                        activeFullPlan.update(s => s ? { ...s, id: event.planId } : s);
                    }
                    if (event.type === "system" && event.line === "[done]" && event.planFile) {
                        fullPlanFeedback = event.planFile;
                        fullPlanPlanning = false;
                        activeFullPlan.update(s => s ? { ...s, status: "done", planFile: event.planFile } : s);
                    }
                },
                onDone: () => {
                    if (fullPlanPlanning) {
                        fullPlanFeedback = "✓";
                        fullPlanPlanning = false;
                    }
                }
            });
        } catch (e) {
            agentRunState.update(s => ({ ...s, running: false }));
            activeFullPlan.update(s => s ? { ...s, status: "error" } : s);
            fullPlanFeedback = e instanceof Error ? e.message : String(e);
            fullPlanPlanning = false;
        }
    }

    async function deleteDoneIssues() {
        const taskIds = group.issues
            .map(i => $doneTasksByIssue.get(i.number))
            .filter((id): id is string => id !== undefined);
        if (taskIds.length === 0) return;
        deletingDone = true;
        try {
            await Promise.all(taskIds.map(id => fetch(`/api/tasks/${id}`, { method: "DELETE" })));
            const updated = new Map($doneTasksByIssue);
            for (const issue of group.issues) updated.delete(issue.number);
            doneTasksByIssue.set(updated);
        } finally {
            deletingDone = false;
        }
    }
</script>

<div
    class="group-card"
    class:has-parent={group.hasParent}
    class:is-selected={isSelected}
    data-tier={tier}
    role="button"
    tabindex="0"
    onclick={(e) => { if (!(e.target as Element).closest('button')) onGroupSelect?.(isSelected ? null : group.keyword); }}
    onkeydown={(e) => { if (e.key === 'Enter') onGroupSelect?.(isSelected ? null : group.keyword); }}
>
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
            {@const isDone = $doneTasksByIssue.has(issue.number)}
            <li class="group-issue" class:is-twin={twinNums.has(issue.number)} class:has-task={$taskIssueNumbers.has(issue.number)} class:is-done={isDone}>
                <button class="issue-num" onclick={() => openIssue(issue.number)}>
                    #{issue.number}
                </button>
                <span class="issue-title">{issue.title}</span>
                {#if isDone}
                    <span class="done-badge" title="Task déjà effectuée">✓</span>
                {:else if twinNums.has(issue.number)}
                    <span class="twin-badge" title="Sujet identique">⇔</span>
                {/if}
            </li>
        {/each}
    </ul>

    {#if evalOpen}
        <div class="eval-panel">
            <div class="eval-panel-head">
                <span class="eval-panel-label">Évaluation</span>
                <button class="eval-close" onclick={() => evalOpen = false}>✕</button>
            </div>
            {#if evalErr}
                <div class="eval-err">{evalErr}</div>
            {:else if evalResult}
                <pre class="eval-result">{evalResult}</pre>
                {#if evalLoading}<span class="eval-cursor">▌</span>{/if}
            {:else if evalLoading}
                <div class="eval-loading">Analyse en cours…</div>
            {/if}
        </div>
    {/if}

    <div class="group-footer">
        <button
            class="btn-evaluate"
            onclick={evaluateGroup}
            disabled={evalLoading}
            title="Évaluer la complexité du groupe avant de générer un fullPlan"
        >{evalLoading ? "…" : "🔍"}</button>

        {#if doneCount > 0}
            <button
                class="btn-purge-done"
                onclick={deleteDoneIssues}
                disabled={deletingDone}
                title="Supprimer les tasks déjà effectuées ({doneCount} issue{doneCount > 1 ? 's' : ''})"
            >{deletingDone ? "…" : `🗑 ${doneCount} effectuée${doneCount > 1 ? 's' : ''}`}</button>
        {/if}

        <button
            class="btn-full-plan"
            onclick={planFullStack}
            disabled={fullPlanPlanning}
            title="Générer le plan complet du groupe"
        >{fullPlanPlanning ? "…" : "⚡ Plan complet"}</button>
        {#if fullPlanFeedback}
            <span class="stack-feedback">{fullPlanFeedback}</span>
        {/if}

        {#if created}
            <a class="created-link" href={created.html_url} target="_blank" rel="noopener">
                ✓ #{created.parentNumber} — {created.title}
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
                onclick={createParent}
                disabled={creating}
            >
                {creating ? "Génération…" : "Créer issue parente"}
            </button>
            {#if createErr}
                <span class="group-err">{createErr}</span>
            {/if}
        {/if}
    </div>
</div>

<style>
/* ── Card ── */
.group-card {
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    padding: 0.45rem 0.55rem;
    background: var(--bg-panel, #0e0e1a);
    cursor: pointer;
    transition: border-color 0.1s;
}
.group-card.has-parent {
    border-color: #2a3a2a;
    opacity: 0.75;
}
.group-card.is-selected {
    border-color: #6a50c0 !important;
    background: #0d0a22;
    opacity: 1;
}
.group-card[data-tier="hot"]  { border-color: #3a2a5a; }
.group-card[data-tier="warm"] { border-color: #2a2a4a; }

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
.group-issue.has-task { background: rgba(59, 130, 246, 0.06); border-left: 2px solid #3b82f6; padding-left: calc(0.6rem - 2px); }
.group-issue.is-done { background: rgba(34, 197, 94, 0.06); border-left: 2px solid #22c55e; padding-left: calc(0.6rem - 2px); opacity: 0.7; }

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

.twin-badge { font-size: 0.55rem; color: #6a5a9a; margin-left: auto; }
.done-badge { font-size: 0.6rem; color: #22c55e; margin-left: auto; font-weight: 700; }

/* ── Stack boxes (subdivisions) ── */
.stack-group {
    margin: 0.2rem 0 0.35rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}
.stack-box {
    border: 1px dashed hsl(calc(var(--stack-hue, 0) * 1deg) 28% 32%);
    border-radius: 3px;
    padding: 0.25rem 0.4rem;
}
.tree-branch-head {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.08rem 0;
}
.residual-connector {
    color: #3a3a5a;
    font-size: 0.6rem;
    flex-shrink: 0;
}
.sub-extra-kw { font-size: 0.55rem; color: #555; }
.tree-leaf {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    font-size: 0.6rem;
    padding-left: 0.1rem;
}
.group-residual { display: flex; flex-direction: column; gap: 0.05rem; }
.residual-head {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.08rem 0;
}
.residual-label { font-size: 0.55rem; color: #555; font-style: italic; }
.sub-keyword {
    font-size: 0.62rem;
    color: #7a6ad9;
    background: #140f30;
    border: 1px solid #3a2a7a;
    border-radius: 3px;
    padding: 0.02rem 0.3rem;
    flex-shrink: 0;
}
.sub-count { font-size: 0.55rem; color: #555; }
.sub-haiku-inline {
    font-size: 0.55rem;
    color: #8a7ac9;
    font-style: italic;
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.btn-stack-plan {
    background: none;
    border: 1px solid #2a3a5a;
    color: #5a7ab9;
    font-size: 0.6rem;
    padding: 0.05rem 0.3rem;
    border-radius: 2px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    line-height: 1;
    flex-shrink: 0;
    margin-left: auto;
}
.btn-stack-plan:hover:not(:disabled) { background: #0a1020; color: #7a9adf; }
.btn-stack-plan:disabled { opacity: 0.4; cursor: default; }
.stack-feedback {
    font-size: 0.52rem;
    color: #5a7a5a;
    font-style: italic;
    flex-shrink: 0;
    max-width: 8rem;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.sub-issues {
    list-style: none;
    padding: 0;
    margin: 0.15rem 0 0 0.3rem;
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
.btn-purge-done {
    background: #1a0a08;
    border: 1px solid #7f1d1d;
    color: #f87171;
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
}
.btn-purge-done:hover:not(:disabled) { background: #2a1010; color: #fca5a5; }
.btn-purge-done:disabled { opacity: 0.5; cursor: default; }

.btn-full-plan {
    background: #0a1020;
    border: 1px solid #2a3a6a;
    color: #6a8ad9;
    font-size: 0.62rem;
    padding: 0.15rem 0.55rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
}
.btn-full-plan:hover:not(:disabled) { background: #0e1830; color: #8aaaff; }
.btn-full-plan:disabled { opacity: 0.5; cursor: default; }
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

/* ── Bouton évaluer ── */
.btn-evaluate {
    background: none;
    border: 1px solid #2a4a3a;
    color: #5a9a7a;
    font-size: 0.65rem;
    padding: 0.12rem 0.35rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    line-height: 1;
    flex-shrink: 0;
}
.btn-evaluate:hover:not(:disabled) { background: #0a1a10; color: #7abaa0; }
.btn-evaluate:disabled { opacity: 0.4; cursor: default; }

/* ── Panneau d'évaluation ── */
.eval-panel {
    margin: 0.3rem 0 0.2rem;
    border: 1px solid #2a4a3a;
    border-radius: 3px;
    background: #080f0c;
    font-size: 0.6rem;
}
.eval-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.2rem 0.45rem;
    border-bottom: 1px solid #1a3a2a;
}
.eval-panel-label {
    font-size: 0.58rem;
    color: #5a9a7a;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.eval-close {
    background: none;
    border: none;
    color: #4a6a5a;
    font-size: 0.6rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
}
.eval-close:hover { color: #7a9a8a; }
.eval-loading {
    padding: 0.4rem 0.45rem;
    color: #5a7a6a;
    font-style: italic;
}
.eval-cursor {
    display: inline-block;
    color: #5a9a7a;
    font-size: 0.65rem;
    animation: blink 1s step-end infinite;
    margin-left: 0.15rem;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.eval-err {
    padding: 0.4rem 0.45rem;
    color: #e05a5a;
}
.eval-result {
    padding: 0.45rem 0.55rem;
    margin: 0;
    color: #a0c0b0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    line-height: 1.55;
    max-height: 18rem;
    overflow-y: auto;
}
</style>
