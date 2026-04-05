<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { get } from "svelte/store";
    import { agentState, taskRefreshTick, issueListRefreshTick, godObjectRefreshTick, pendingSelectTaskId, agentRunState, hoveredIssueNumber, planGroups, planModeTask, planAllState, issueAnalysis, tasksReady, consoleTab, taskIssueNumbers, doneTasksByIssue, activeFullPlan, issueGroupsCache } from "$lib/stores/agent";
    import { JgrItem } from 'jgr-ui';
    import { taskToFilter, getInitialConsoleTab } from './TaskList.helpers';
    import { taskStore } from "$lib/domain/TaskStore.svelte.ts";
    import TaskDetail from "./TaskDetail.svelte";
    import Fuse from 'fuse.js';
    import type { Task, Filter } from "$lib/types/task";
    import { STATUS_LABEL, STATUS_COLOR, FILTERS } from "$lib/types/task";

    let filter = $state<Filter | null>(null);
    let selected = $state<Task | null>(null);
    let selectedTaskFilter = $derived(selected ? taskToFilter(selected) : null);
    let filterQuery = $state("");
    let searchScope = $state<"tasks" | "all">("tasks");
    let roadmapActive = $state(false);

    const SELECTED_KEY = "claudicator:selected-task";

    // Roadmap grouping (#36 : calculé depuis $planGroups)
    let tasksByGroup = $derived<{ name: string; tasks: Task[] }[]>((() => {
        const groups = $planGroups;
        if (!groups.length) {
            return taskStore.tasks.length ? [{ name: 'default', tasks: taskStore.tasks }] : [];
        }
        const result: { name: string; tasks: Task[] }[] = groups.map(g => ({
            name: `P${g.index} ${g.name}`,
            tasks: taskStore.tasks.filter(t => t.issueNumber !== undefined && g.issues.includes(t.issueNumber)),
        })).filter(g => g.tasks.length > 0);
        const grouped = new Set(result.flatMap(g => g.tasks.map(t => t.id)));
        const ungrouped = taskStore.tasks.filter(t => !grouped.has(t.id));
        if (ungrouped.length) result.push({ name: 'sans groupe', tasks: ungrouped });
        return result;
    })());

    // Cross-search issues (#40)
    let foundIssues = $derived<{ number: number; title: string }[]>((() => {
        if (searchScope !== "all" || filterQuery.length < 2) return [];
        const snap = $issueGroupsCache;
        if (!snap) return [];
        const all: { number: number; title: string }[] = [
            ...snap.ungroupedIssues,
            ...snap.groups.flatMap((g: any) => g.issues ?? []),
        ];
        const q = filterQuery.toLowerCase();
        return all.filter(i => `${i.number} ${i.title}`.toLowerCase().includes(q)).slice(0, 10);
    })());

    let statusFiltered = $derived((() => {
        const groups = $planGroups;
        function pos(n: number | undefined): number {
            if (!n || !groups.length) return Infinity;
            for (let gi = 0; gi < groups.length; gi++) {
                const p = groups[gi].issues.indexOf(n);
                if (p >= 0) return gi * 1000 + p;
            }
            return Infinity;
        }
        const base = filter === null
            ? taskStore.tasks
            : taskStore.tasks.filter(t => taskToFilter(t) === filter);
        return base.slice().sort((a, b) => pos(a.issueNumber) - pos(b.issueNumber));
    })());

    // #40 : en mode 'all', Fuse cherche sur title + status dans toutes les tasks
    let fuse = $derived(
        searchScope === "all"
            ? new Fuse(taskStore.tasks, { keys: ['title', 'status'], threshold: 0.4 })
            : new Fuse(statusFiltered, { keys: ['title'], threshold: 0.4 })
    );
    let filtered = $derived(filterQuery.trim()
        ? fuse.search(filterQuery).map(r => r.item)
        : statusFiltered);
    let countOf = $derived((f: Filter) => taskStore.tasks.filter(t => taskToFilter(t) === f).length);

    // Auto-sélection du fullplan en cours d'exécution
    $effect(() => {
        if (!$agentRunState.running || !$agentRunState.taskId) return;
        const runningTask = taskStore.tasks.find(t => t.fullPlanId === $agentRunState.taskId);
        if (!runningTask) return;
        if (selected?.id !== runningTask.id) selectTask(runningTask, true);
    });

    async function loadTasks() {
        taskStore.loading = true;
        try {
            const res = await fetch("/api/tasks");
            taskStore.tasks = await res.json();
            taskIssueNumbers.set(new Set(taskStore.tasks.filter(t => t.issueNumber).map(t => t.issueNumber!)));
            const DONE = new Set(["merged", "validation", "documentation"]);
            doneTasksByIssue.set(new Map(taskStore.tasks.filter(t => t.issueNumber && DONE.has(t.status)).map(t => [t.issueNumber!, t.id])));
            if (selected) {
                const prev = selected.status;
                selected = taskStore.tasks.find(t => t.id === selected!.id) ?? null;
                if (selected && selected.status !== prev) {
                    const f = taskToFilter(selected);
                    if (f) filter = f;
                }
            }
        } finally {
            taskStore.loading = false;
        }
    }

    /** Refresh silencieux : ne cache pas la liste pendant le chargement. */
    async function loadTasksSilent() {
        try {
            const res = await fetch("/api/tasks");
            const fresh = await res.json();
            if (!Array.isArray(fresh)) return;
            taskStore.tasks = fresh;
            taskIssueNumbers.set(new Set(taskStore.tasks.filter(t => t.issueNumber).map(t => t.issueNumber!)));
            const DONE = new Set(["merged", "validation", "documentation"]);
            doneTasksByIssue.set(new Map(taskStore.tasks.filter(t => t.issueNumber && DONE.has(t.status)).map(t => [t.issueNumber!, t.id])));
            if (selected) {
                const prev = selected.status;
                selected = taskStore.tasks.find(t => t.id === selected!.id) ?? null;
                if (selected && selected.status !== prev) {
                    const f = taskToFilter(selected);
                    if (f) filter = f;
                }
            }
        } catch { /* silencieux */ }
    }

    function clearSelected() {
        selected = null;
        planModeTask.set(null);
        localStorage.removeItem(SELECTED_KEY);
    }

    async function remove(task: Task) {
        if (task.type === "fullplan" && task.fullPlanId) {
            await fetch(`/api/issues/groups/full-plans/${task.fullPlanId}`, { method: "DELETE" });
            if (selected?.id === task.id) activeFullPlan.set(null);
        }
        await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
        if (selected?.id === task.id) clearSelected();
        await loadTasks();
        if (task.title.startsWith("Refactoring:")) {
            godObjectRefreshTick.update(n => n + 1);
        }
    }

    async function selectTask(initialTask: Task, silent = false) {
        if (selected?.id === initialTask.id) {
            selected = null;
            planModeTask.set(null);
            if (initialTask.type === "fullplan") {
                activeFullPlan.set(null);
            }
            localStorage.removeItem(SELECTED_KEY);
            return;
        }
        localStorage.setItem(SELECTED_KEY, initialTask.id);
        selected = initialTask;
        // issue #178 - scroller vers la task sélectionnée
        if (!silent) {
            requestAnimationFrame(() => {
                document.querySelector(`[data-task-id="${initialTask.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            });
        }
        const taskFilter = taskToFilter(initialTask);
        if (taskFilter) filter = taskFilter;

        if (initialTask.status !== "merged" && initialTask.status !== "failed" && initialTask.type !== "fullplan") {
            planModeTask.set({ id: initialTask.id, title: initialTask.title, issueNumber: initialTask.issueNumber });
            if (!silent) consoleTab.set(getInitialConsoleTab(initialTask));
        }
    }

    onMount(async () => {
        const hasPending = !!get(pendingSelectTaskId);
        await loadTasks();
        if (hasPending) {
            tasksReady.set(true);
            return;
        }
        const savedId = localStorage.getItem(SELECTED_KEY);
        const savedTask = savedId ? taskStore.tasks.find(t => t.id === savedId) : null;
        const validSaved = savedTask && savedTask.status !== "merged" && savedTask.status !== "failed" ? savedTask : null;
        const toSelect = taskStore.tasks.find(t => t.status === "planification")
            ?? validSaved
            ?? taskStore.tasks.find(t => t.hasPlan && t.status !== "merged" && t.status !== "failed");
        if (toSelect) await selectTask(toSelect, true);
        tasksReady.set(true);
    });

    // Recharger les tasks quand la roadMap est fermée
    let _prevResult = $issueAnalysis.result;
    const _unsubAnalysis = issueAnalysis.subscribe(s => {
        if (_prevResult !== null && s.result === null && !s.running) loadTasksSilent();
        _prevResult = s.result;
    });
    onDestroy(_unsubAnalysis);

    $effect(() => { if ($taskRefreshTick) onRefreshTick(); });

    function onRefreshTick() {
        (async () => {
            await loadTasksSilent();
            const pendingId = $pendingSelectTaskId;
            if (pendingId) {
                pendingSelectTaskId.set(null);
                const toSelect = taskStore.tasks.find(t => t.id === pendingId);
                if (toSelect) { await selectTask(toSelect); return; }
            }
        })();
    }

    function taskPrefix(task: Task): string {
        if (!task.issueNumber) return "";
        const grp = $planGroups.find(g => g.issues.includes(task.issueNumber!));
        return grp ? `P${grp.index} #${task.issueNumber}` : `#${task.issueNumber}`;
    }

    function pipelineLabel(task: Task): { name: string; color: string } {
        return { name: STATUS_LABEL[task.status], color: STATUS_COLOR[task.status] };
    }

    function rowLabels(task: Task, isActive: boolean): { name: string; color: string }[] {
        if (isActive) return [pipelineLabel(task)];
        if (task.status === "failed")        return [{ name: "Échouée",   color: "f44336" }];
        if (task.status === "planification") return [{ name: "en cours",  color: "f7c948" }];
        if (task.status === "merged")        return [{ name: "Mergée",    color: "4caf50" }];
        if (task.status === "documentation" || task.status === "validation" || task.status === "implementation") {
            const planStr = task.planUsage ? `p:${Math.round(task.planUsage.inputTokens / 100) / 10}k` : "";
            const implStr = task.implUsage ? `${Math.round(task.implUsage.inputTokens / 100) / 10}k` : "";
            const sigma = (task.planUsage && task.implUsage) ? ` Σ${Math.round((task.planUsage.inputTokens + task.implUsage.inputTokens) / 100) / 10}k` : "";
            const label = [planStr, implStr].filter(Boolean).join(" · ");
            return [{ name: (label || "impl.") + sigma, color: "9181f9" }];
        }
        return [];
    }
</script>

<div class="panel">
    <div class="panel-header">Tasks</div>

    <div class="filter-bar">
        {#each FILTERS as f}
            <button class="filter-btn" class:active={filter === f} class:task-current={f === selectedTaskFilter} onclick={() => filter = filter === f ? null : f}>
                {STATUS_LABEL[f]}
                {#if countOf(f) > 0}<span class="count">{countOf(f)}</span>{/if}
            </button>
        {/each}
        <button class="refresh-btn" onclick={loadTasks} title="Rafraîchir">↺</button>
    </div>

    <div class="search-bar">
        <input
            class="search-input"
            placeholder="Filtrer…"
            bind:value={filterQuery}
        />
        {#if filterQuery}
            <button class="search-clear" onclick={() => filterQuery = ''}>✕</button>
        {/if}
        <button
            class="scope-toggle"
            class:scope-all={searchScope === "all"}
            onclick={() => searchScope = searchScope === "tasks" ? "all" : "tasks"}
            title={searchScope === "all" ? "Recherche élargie (tasks + issues)" : "Recherche dans les tasks uniquement"}
        >{searchScope === "all" ? "⊕" : "T"}</button>
    </div>

    <div class="list">
        {#if taskStore.loading}
            <p class="hint">Chargement…</p>
        {:else if filtered.length === 0}
            <p class="hint">Aucune task</p>
        {:else}
            {#each filtered as task}
                {#if roadmapActive}
                    {@const taskGroupName = (() => {
                        for (const g of tasksByGroup) {
                            if (g.tasks[0]?.id === task.id) return g.name;
                        }
                        return null;
                    })()}
                    {#if taskGroupName !== null}
                        <div class="task-group-header">{taskGroupName}</div>
                    {/if}
                {/if}
                <div
                    class="task-row-wrap"
                    class:task-closed={task.status === "failed" || task.status === "merged"}
                    class:task-running={$agentRunState.running && $agentRunState.taskId === task.id}
                    data-task-id={task.id}
                    onmouseenter={() => task.issueNumber && hoveredIssueNumber.set(task.issueNumber)}
                    onmouseleave={() => hoveredIssueNumber.set(null)}
                >
                    <JgrItem
                        prefix={taskPrefix(task)}
                        title={task.title}
                        labels={($agentRunState.running && $agentRunState.taskId === task.id && $agentRunState.liveUsage)
                            ? [{ name: `${Math.round($agentRunState.liveUsage.inputTokens / 100) / 10}k…`, color: "f7c948" }]
                            : rowLabels(task, selected?.id === task.id)}
                        state={selected?.id === task.id || ($planAllState.running && $planAllState.currentTaskId === task.id) ? 'selected' : 'default'}
                        onselect={() => selectTask(task)}
                    />
                    <button
                        class="task-delete-btn"
                        onclick={(e) => { e.stopPropagation(); remove(task); }}
                        title="Supprimer"
                    >✕</button>
                </div>
                {#if selected?.id === task.id}
                    <TaskDetail
                        {task}
                        onloadtasks={loadTasks}
                        onloadtaskssilent={loadTasksSilent}
                        onselecttask={selectTask}
                        onclearselected={clearSelected}
                        onremove={remove}
                    />
                {/if}
            {/each}
        {/if}
        {#if foundIssues.length > 0}
            <div class="found-issues-section">
                <div class="found-issues-label">Issues —</div>
                {#each foundIssues as issue}
                    <div class="found-issue-row">
                        <span class="found-issue-num">#{issue.number}</span>
                        <span class="found-issue-title">{issue.title}</span>
                    </div>
                {/each}
            </div>
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
    padding: 0.6rem 1rem;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}
.filter-bar {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: none;
}
.filter-bar::-webkit-scrollbar { display: none; }
.filter-btn {
    background: none;
    border: none;
    border-right: 1px solid var(--border);
    color: #2e2e2e;
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0.4rem 0.55rem;
    cursor: pointer;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    transition: color 0.1s;
}
.filter-btn:hover { color: #555; }
.filter-btn.active { color: #777; }
.filter-btn.task-current { color: var(--color-impl); }
.count { font-size: 0.5rem; opacity: 0.6; margin-left: 0.4rem; }
.refresh-btn {
    background: none;
    border: none;
    color: #2a2a2a;
    font-size: 0.9rem;
    cursor: pointer;
    padding: 0 0.6rem;
    margin-left: auto;
    line-height: 1;
}
.refresh-btn:hover { color: #555; }
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
.scope-toggle {
    background: none;
    border: none;
    color: #444;
    font-size: 0.7rem;
    cursor: pointer;
    padding: 0 0.4rem;
    font-family: 'JetBrains Mono', monospace;
}
.scope-toggle:hover { color: #9181f9; }
.scope-toggle.scope-all { color: #9181f9; }
/* ── Issues trouvées (cross-search) ── */
.found-issues-section {
    border-top: 1px solid var(--border);
    padding: 0.3rem 0;
}
.found-issues-label {
    font-size: 0.55rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    padding: 0.2rem 1rem;
}
.found-issue-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 1rem;
    cursor: pointer;
}
.found-issue-row:hover { background: var(--bg-subtle, #f5f5f5); }
.found-issue-num { font-size: 0.6rem; color: #9181f9; min-width: 2.5rem; }
.found-issue-title { font-size: 0.62rem; color: var(--text-muted); }
.list { flex: 1; min-height: 0; overflow-y: auto; }
.list::-webkit-scrollbar { width: 4px; }
.list::-webkit-scrollbar-track { background: transparent; }
.list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.task-group-header {
    padding: 0.25rem 1rem;
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    background: var(--bg-subtle, #f5f5f5);
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin-top: 0.25rem;
}
.task-row-wrap { position: relative; }
.task-closed :global(.item-row) { opacity: 0.55; }
.task-closed :global(.item-title) { text-decoration: line-through; }
.task-running { background: rgba(247, 201, 72, 0.06); border-left: 2px solid #f7c948; }
.task-delete-btn {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #2a2a2a;
    font-size: 0.65rem;
    cursor: pointer;
    padding: 0.2rem 0.35rem;
    border-radius: 3px;
    opacity: 0;
    transition: opacity 0.1s, color 0.1s;
    line-height: 1;
}
.task-row-wrap:hover .task-delete-btn { opacity: 1; }
.task-delete-btn:hover { color: #f44336; }
.hint { padding: 1rem; color: #333; font-size: 0.8rem; font-family: 'JetBrains Mono', monospace; }
</style>
