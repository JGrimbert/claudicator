<script lang="ts">
    import { agentState, notifyTaskCreated } from "$lib/stores/agent";

    // ─── Plan ─────────────────────────────────────────────────────────────────
    let prevIssue = 0;
    $: if ($agentState.issue?.number && $agentState.issue.number !== prevIssue) {
        prevIssue = $agentState.issue.number;
        loadPlan($agentState.issue.number);
    }

    async function loadPlan(num: number) {
        const res  = await fetch(`/api/plan?issue=${num}`);
        const data = await res.json();
        agentState.update(s => ({
            ...s,
            plan:   data.exists ? data.content : null,
            status: data.exists ? "done" : "idle"
        }));
    }

    async function generatePlan() {
        const issue = $agentState.issue;
        if (!issue) return;
        agentState.update(s => ({ ...s, status: "planning" }));
        try {
            const res  = await fetch("/api/issue", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ issue: issue.number })
            });
            const data = await res.json();
            agentState.update(s => ({ ...s, status: "done", plan: data.plan }));
        } catch {
            agentState.update(s => ({ ...s, status: "error" }));
        }
    }

    // ─── Navigation ───────────────────────────────────────────────────────────
    async function navigateToSubIssue(number: number) {
        const current = $agentState.issue;
        if (!current) return;

        agentState.update(s => ({
            ...s,
            navigationStack: [...s.navigationStack, current],
            status: "loading"
        }));

        const res = await fetch(`/api/issue?number=${number}`);
        const full = await res.json();

        agentState.update(s => ({
            ...s,
            issue: full,
            plan: null,
            status: "idle",
            knownSubIssueNumbers: [
                ...new Set([...s.knownSubIssueNumbers, ...(full.subIssues?.map((si: any) => si.number) ?? [])])
            ]
        }));
    }

    function navigateBack() {
        agentState.update(s => {
            const stack = [...s.navigationStack];
            const parent = stack.pop() ?? null;
            return { ...s, issue: parent, plan: null, status: "idle", navigationStack: stack };
        });
    }

    // ─── Créer une task ───────────────────────────────────────────────────────
    let taskCreated = false;

    async function createTask() {
        const issue = $agentState.issue;
        if (!issue) return;
        await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: issue.title, issueNumber: issue.number }),
        });
        notifyTaskCreated();
        taskCreated = true;
        setTimeout(() => { taskCreated = false; }, 2000);
    }
</script>

<div class="panel">
    <div class="panel-header">
        {#if $agentState.navigationStack.length > 0}
            <button class="back-btn" onclick={navigateBack}>
                ← #{$agentState.navigationStack.at(-1)?.number}
            </button>
        {/if}
        <span>
            {#if $agentState.plan && $agentState.issue}
                Plan — #{$agentState.issue.number}
            {:else if $agentState.issue}
                #{$agentState.issue.number}
            {:else}
                Artefact
            {/if}
        </span>
    </div>

    <div class="content">
        {#if $agentState.issue?.body}
            <div class="issue-body">
                <h2 class="issue-title">#{$agentState.issue.number} — {$agentState.issue.title}</h2>
                <pre class="body-text">{$agentState.issue.body}</pre>
                {#if $agentState.issue.subIssues?.length}
                    <div class="sub-issues">
                        <p class="sub-label">Sub-issues ({$agentState.issue.subIssues.length})</p>
                        <ul>
                            {#each $agentState.issue.subIssues as sub}
                                <li class="sub-item" class:closed={sub.state === "closed"}>
                                    <span class="sub-check">{sub.state === "closed" ? "✓" : "○"}</span>
                                    <button class="sub-btn" onclick={() => navigateToSubIssue(sub.number)}>
                                        <span class="sub-num">#{sub.number}</span>
                                        <span class="sub-title">{sub.title}</span>
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    </div>
                {/if}
            </div>
        {:else if $agentState.status === "loading"}
            <p class="hint blink">Chargement...</p>
        {:else}
            <p class="hint">Sélectionnez une issue pour commencer.</p>
        {/if}
    </div>

    {#if $agentState.issue}
        <div class="plan-section">
            <div class="plan-header">
                <span class="plan-label">Plan — #{$agentState.issue.number}</span>
                <button class="plan-btn" onclick={createTask} disabled={taskCreated} title="Créer une task liée à cette issue">
                    {taskCreated ? "✓ créée" : "+ Task"}
                </button>
                <button class="plan-btn" onclick={generatePlan} disabled={$agentState.status === "planning"}>
                    {$agentState.status === "planning" ? "…" : $agentState.plan ? "Regénérer" : "Générer"}
                </button>
            </div>
            {#if $agentState.status === "planning"}
                <p class="hint blink" style="padding:0.5rem 1rem">Génération en cours…</p>
            {:else if $agentState.plan}
                <div class="plan-content">
                    <pre class="plan">{$agentState.plan}</pre>
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
.panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid #1e1e1e;
}
.panel-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #555;
    border-bottom: 1px solid #1e1e1e;
    flex-shrink: 0;
}
.back-btn {
    background: none;
    border: 1px solid #2a2a2a;
    color: #7c6af7;
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    text-transform: none;
    letter-spacing: normal;
    flex-shrink: 0;
}
.back-btn:hover { background: #1e1e2e; }
.content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1rem;
}
.content::-webkit-scrollbar { width: 4px; }
.content::-webkit-scrollbar-track { background: transparent; }
.content::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 2px; }
.content::-webkit-scrollbar-thumb:hover { background: #2a2a2a; }
.plan-section {
    flex-shrink: 0;
    border-top: 1px solid #1e1e1e;
    display: flex;
    flex-direction: column;
    max-height: 40%;
}
.plan-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid #1a1a1a;
    flex-shrink: 0;
}
.plan-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #444;
}
.plan-btn {
    background: none;
    border: 1px solid #222;
    color: #555;
    font-size: 0.62rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
}
.plan-btn:hover:not(:disabled) { color: #9181f9; border-color: #9181f9; }
.plan-btn:disabled { opacity: 0.4; cursor: default; }
.plan-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem 1rem;
}
.plan-content::-webkit-scrollbar { width: 4px; }
.plan-content::-webkit-scrollbar-track { background: transparent; }
.plan-content::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 2px; }
.plan {
    color: #bbb;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    line-height: 1.6;
}
.issue-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
.issue-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #bbb;
    line-height: 1.4;
}
.body-text {
    color: #888;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
    margin: 0;
}
.sub-issues {
    border-top: 1px solid #1e1e1e;
    padding-top: 0.75rem;
}
.sub-label {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #444;
    margin-bottom: 0.4rem;
}
ul { list-style: none; padding: 0; margin: 0; }
.sub-item {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.1rem 0;
}
.sub-check { color: #555; font-size: 0.7rem; width: 12px; flex-shrink: 0; }
.sub-item.closed .sub-check { color: #4caf50; }
.sub-btn {
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.15rem 0.25rem;
    border-radius: 3px;
    text-align: left;
}
.sub-btn:hover { background: #1e1e2e; }
.sub-num { color: #555; font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; flex-shrink: 0; }
.sub-title { color: #999; font-size: 0.78rem; }
.sub-item.closed .sub-title { color: #444; text-decoration: line-through; }
.hint {
    color: #2a2a2a;
    font-size: 0.8rem;
    font-family: 'JetBrains Mono', monospace;
}
.blink {
    color: #555;
    animation: blink 1.2s step-start infinite;
}
@keyframes blink {
    50% { opacity: 0.3; }
}
</style>
