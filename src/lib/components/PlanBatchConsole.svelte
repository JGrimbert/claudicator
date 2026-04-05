<script lang="ts">
    import { agentRunState, planAllState, notifyTaskCreated, taskRefreshTick, stopConsoleStream, startConsoleStream } from "$lib/stores/agent";
    import type { Group } from "./IssueAnalysis.helpers";

    let { groups, frame }: {
        groups: Group[];
        frame: number;
    } = $props();

    const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

    let createLoading = $state(false);
    let createFeedback = $state("");
    let planLoading = $state(false);
    let planFeedback = $state("");
    let planDone = $state(0);
    let planTotal = $state(0);
    let planLogArea: HTMLDivElement | null = $state(null);

    $effect(() => {
        if (planLogArea) planLogArea.scrollTop = planLogArea.scrollHeight;
    });

    let planLogs = $derived($agentRunState.logs.filter(
        (l: { type: string; line: string }) => l.type !== "usage" && !/^\[pid:\d+\]$/.test(l.line)
    ));

    async function createTasks(issueNumbers?: number[]) {
        if (createLoading) return;
        createLoading = true;
        createFeedback = "";
        try {
            const snap = await fetch("/api/issues/snapshot");
            if (!snap.ok) { createFeedback = "Snapshot introuvable"; return; }
            const { snapshot } = await snap.json();
            if (!snapshot?.length) { createFeedback = "Aucune issue dans la snapshot"; return; }

            const targets = issueNumbers
                ? snapshot.filter((s: any) => issueNumbers.includes(s.number))
                : snapshot;
            let created = 0, existing = 0;
            let lastCreatedId: string | undefined;
            await Promise.all(targets.map(async (issue: { number: number; title: string }) => {
                const r = await fetch("/api/tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: issue.title, issueNumber: issue.number })
                });
                if (r.ok) {
                    const data = await r.json();
                    if (data.alreadyExisted) { existing++; }
                    else { created++; lastCreatedId = data.id; }
                }
                else { existing++; }
            }));
            createFeedback = `${created} task${created > 1 ? "s" : ""} créée${created > 1 ? "s" : ""}${existing > 0 ? `, ${existing} existaient déjà` : ""}`;
            if (created > 0) notifyTaskCreated(created === 1 ? lastCreatedId : undefined);
        } catch (e: any) {
            createFeedback = e.message ?? "Erreur";
        } finally {
            createLoading = false;
        }
    }

    async function planTasks() {
        if (planLoading || createLoading) return;
        if ($agentRunState.running || $agentRunState.sessionAlive) {
            const ok = confirm("La console est active. L'interrompre pour lancer le plan en masse ?");
            if (!ok) return;
            stopConsoleStream();
        }
        planLoading = true;
        planFeedback = "";
        planDone = 0;
        try {
            const res = await fetch("/api/tasks");
            if (!res.ok) { planFeedback = "Erreur chargement tasks"; return; }
            const allTasks = await res.json();
            const toplan = allTasks.filter((t: any) => !t.hasPlan && t.status !== "running");
            planTotal = toplan.length;
            if (!toplan.length) { planFeedback = "Toutes les tasks sont déjà planifiées"; return; }

            const orderedTasks = [...toplan].sort((a: any, b: any) => {
                const pos = (n: number | undefined) => {
                    if (!n) return Infinity;
                    for (let gi = 0; gi < groups.length; gi++) {
                        const idx = groups[gi].issues.indexOf(n);
                        if (idx >= 0) return gi * 1000 + idx;
                    }
                    return Infinity;
                };
                return pos(a.issueNumber) - pos(b.issueNumber);
            });

            planAllState.set({ running: true, currentTaskId: null });

            agentRunState.update(s => ({
                ...s, taskId: null, taskTitle: `Planification 0/${planTotal}`,
                logs: [], running: false, sessionAlive: false, completionLabel: null
            }));

            for (const task of orderedTasks) {
                planAllState.update(s => ({ ...s, currentTaskId: task.id }));
                planFeedback = `${planDone + 1}/${planTotal} · ${task.title.slice(0, 28)}`;

                let prompt = task.title;
                try {
                    const ctxRes = await fetch("/api/context", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ taskId: task.id })
                    });
                    if (ctxRes.ok) {
                        const ctxData = await ctxRes.json();
                        if (ctxData.prompt) prompt = ctxData.prompt;
                    }
                } catch { /* fallback titre */ }

                agentRunState.update(s => ({
                    ...s,
                    taskId: task.id,
                    taskTitle: `${planDone + 1}/${planTotal} — ${task.title.slice(0, 25)}`,
                    running: true,
                    completionLabel: null,
                }));
                try {
                    const runRes = await fetch("/api/agent/run", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ prompt, taskId: task.id })
                    });
                    await startConsoleStream(runRes);
                } finally {
                    taskRefreshTick.update(n => n + 1);
                }

                planDone++;
                agentRunState.update(s => ({
                    ...s,
                    completionLabel: `${planDone}/${planTotal} planifiée${planDone > 1 ? "s" : ""}`
                }));
                planFeedback = `${planDone}/${planTotal} planifiée${planDone > 1 ? "s" : ""}`;
            }
            planFeedback = `${planDone} task${planDone > 1 ? "s" : ""} planifiée${planDone > 1 ? "s" : ""}`;
            agentRunState.update(s => ({
                ...s,
                completionLabel: `${planDone} task${planDone > 1 ? "s" : ""} planifiée${planDone > 1 ? "s" : ""} · vérifiez les plans`
            }));
        } catch (e: any) {
            planFeedback = e.message ?? "Erreur";
        } finally {
            planLoading = false;
            planAllState.set({ running: false, currentTaskId: null });
        }
    }
</script>

<div class="action-bar">
    {#if planFeedback}
        <span class="feedback">{planFeedback}</span>
    {:else if createFeedback}
        <span class="feedback">{createFeedback}</span>
    {/if}
    <button class="btn-tasks" onclick={() => createTasks()} disabled={createLoading || planLoading}>
        {createLoading ? "Création…" : "Créer tasks"}
    </button>
    <button class="btn-plan" onclick={planTasks} disabled={planLoading || createLoading}>
        {#if planLoading}
            {planDone}/{planTotal} ⠿
        {:else}
            Planifier tasks
        {/if}
    </button>
</div>

{#if planLoading || ($agentRunState.taskId && planLogs.length > 0 && !$agentRunState.running && planFeedback)}
    <div class="plan-log-area" bind:this={planLogArea}>
        <div class="plan-log-header">
            <span class="plan-log-task">{$agentRunState.taskTitle}</span>
            {#if $agentRunState.running}<span class="plan-log-spin">{FRAMES[frame]}</span>{/if}
        </div>
        {#each planLogs as entry}
            <div class="plan-log-line" class:sys={entry.type === "system"}>{entry.line}</div>
        {/each}
    </div>
{/if}

<style>
.action-bar {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.5rem 1.2rem;
    background: var(--bg-deep);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
}
.btn-tasks {
    background: #1a1040;
    border: 1px solid #4a3a8a;
    color: #9181f9;
    font-size: 0.65rem;
    padding: 0.22rem 0.75rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.15s;
}
.btn-tasks:hover:not(:disabled) { background: #251850; }
.btn-tasks:disabled { opacity: 0.4; cursor: default; }
.btn-plan {
    background: #0a1a10;
    border: 1px solid #2a4a3a;
    color: #4caf50;
    font-size: 0.65rem;
    padding: 0.22rem 0.75rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.15s;
}
.btn-plan:hover:not(:disabled) { background: #0f2a18; }
.btn-plan:disabled { opacity: 0.4; cursor: default; }
.plan-log-area {
    max-height: 180px;
    overflow-y: auto;
    border-top: 1px solid var(--border);
    background: var(--bg-deep);
    flex-shrink: 0;
}
.plan-log-area::-webkit-scrollbar { width: 3px; }
.plan-log-area::-webkit-scrollbar-thumb { background: var(--border); }
.plan-log-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.2rem 1.2rem;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--bg-deep);
    z-index: 1;
}
.plan-log-task {
    font-size: 0.58rem;
    color: #3a3a5a;
    font-style: italic;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.plan-log-spin { font-size: 0.7rem; color: #4caf50; flex-shrink: 0; }
.plan-log-line {
    font-size: 0.65rem;
    color: #777;
    line-height: 1.55;
    padding: 0 1.2rem;
    white-space: pre-wrap;
    word-break: break-word;
}
.plan-log-line.sys { color: #2a2a3a; font-style: italic; }
.feedback {
    font-size: 0.62rem;
    color: #7c9e7c;
    flex: 1;
    font-style: italic;
}
</style>
