<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { agentState, taskRefreshTick, agentRunState, hoveredIssueNumber, planGroups, planModeTask, planAllState, issueAnalysis, tasksReady, type Issue } from "$lib/stores/agent";
    import ItemRow from "$lib/components/ItemRow.svelte";
    import PromptUsage from "$lib/components/PromptUsage.svelte";


    type TaskStatus = "specification" | "planification" | "implementation" | "documentation" | "validation" | "merged" | "failed";
    type TokenUsage = { inputTokens: number; outputTokens: number };
    type Task = {
        id: string;
        title: string;
        status: TaskStatus;
        issueNumber?: number;
        branch?: string;
        pushed?: boolean;
        logs: string[];
        usage?: TokenUsage;
        totalUsage?: TokenUsage;
        planUsage?: TokenUsage;
        implUsage?: TokenUsage;
        hasPlan?: boolean;
        createdAt: string;
        updatedAt: string;
    };
    type WfPanel = "plan" | "implement" | "commit" | "push";

    const STATUS_LABEL: Record<TaskStatus, string> = {
        specification:  "Spécification",
        planification:  "Planification",
        implementation: "Implémentation",
        documentation:  "Validation",
        validation:     "Validation",
        merged:         "Mergée",
        failed:         "Échouée",
    };
    const STATUS_COLOR: Record<TaskStatus, string> = {
        specification:  "555555",
        planification:  "f7c948",
        implementation: "2196f3",
        documentation:  "9c27b0",
        validation:     "9c27b0",
        merged:         "4caf50",
        failed:         "f44336",
    };
    const FILTERS = ["specification", "implementation", "validation", "merged"] as const;
    type Filter = typeof FILTERS[number];

    function statusToFilter(status: TaskStatus): Filter | null {
        if (status === "specification" || status === "planification") return "specification";
        if (status === "implementation") return "implementation";
        if (status === "documentation" || status === "validation") return "validation";
        if (status === "merged") return "merged";
        return null;
    }

    let tasks: Task[] = [];
    let loading = true;
    let filter: Filter | null = null;
    $: selectedTaskFilter = selected ? statusToFilter(selected.status) : null;
    let selected: Task | null = null;
    let newTitle = "";
    let creating = false;


    // Workflow state
    let selectedPanel: WfPanel = "plan";
    let wfError = "";

    // Plan
    let planContent: string | null = null;
    let planLoading = false;
    let implEdit = "";
    let initialCommitting = false;

    // Diff / commit
    let diffContent: string | null = null;
    let diffLoading = false;
    let commitMsg = "";
    let committing = false;
    let reverting = false;
    let revertConfirm = false;
    let branchCreating = false;

    async function createBranchAndShowDiff(task: Task) {
        if (branchCreating) return;
        branchCreating = true; wfError = "";
        try {
            const res = await fetch(`/api/tasks/${task.id}/initial-commit`, { method: "POST" });
            const data = await res.json();
            if (data.error && res.status !== 409) { wfError = data.error; return; }
            await loadTasks();
            if (selected?.id === task.id) {
                await loadDiff(task.id);
                selectedPanel = "commit";
            }
        } catch (e: any) {
            wfError = e.message;
        } finally { branchCreating = false; }
    }

    // Push / merge
    let pushing = false;
    let merging = false;

    // Reset task bloquée
    let resetting = false;
    async function resetTask(task: Task) {
        if (resetting) return;
        resetting = true;
        try {
            const res = await fetch(`/api/tasks/${task.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "specification" })
            });
            const data = await res.json();
            if (!data.error) await loadTasks();
        } finally { resetting = false; }
    }

    // Issue liée
    let linkedIssueState: "open" | "closed" | null = null;
    let closingIssue = false;

    async function loadLinkedIssueState(issueNumber: number) {
        linkedIssueState = null;
        try {
            const res = await fetch(`/api/issue?number=${issueNumber}`);
            if (res.ok) {
                const data = await res.json();
                linkedIssueState = data.state === "closed" ? "closed" : "open";
            }
        } catch { /* silencieux */ }
    }

    async function closeLinkedIssue(task: Task) {
        if (!task.issueNumber || closingIssue) return;
        closingIssue = true; wfError = "";
        try {
            const res = await fetch(`/api/issues/${task.issueNumber}/close`, { method: "POST" });
            const data = await res.json();
            if (data.error) { wfError = data.error; return; }
            linkedIssueState = "closed";
        } catch (e: any) {
            wfError = e.message;
        } finally { closingIssue = false; }
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
            const tokens = task.totalUsage ?? task.usage;
            const tokStr = tokens ? ` · ${Math.round(tokens.inputTokens / 100) / 10}k` : "";
            return [{ name: `impl.${tokStr}`, color: "9181f9" }];
        }
        return [];
    }

    // 0=plan 1=impl 2=commit 3=push
    function taskPipelineStep(task: Task): number {
        if (task.status === "merged" || task.status === "validation" || task.status === "documentation") return 3;
        if (task.status === "implementation")                                                            return 1;
        return 0;
    }

    $: filtered = (() => {
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
            ? tasks
            : tasks.filter(t => filter === "validation"
                ? (t.status === "validation" || t.status === "documentation")
                : t.status === filter);
        return base.slice().sort((a, b) => pos(a.issueNumber) - pos(b.issueNumber));
    })();
    $: countOf = (f: Filter) => tasks.filter(t =>
        f === "validation"
            ? (t.status === "validation" || t.status === "documentation")
            : t.status === f
    ).length;

    // Index de l'étape courante (0=plan, 1=impl, 2=commit, 3=push)
    $: currentStep = (() => {
        if (!planContent) return 0;
        if (!selected?.branch) return 1;
        if (diffLoading || diffContent === null) {
            // Fallback sur le statut serveur si le diff n'est pas encore chargé
            if (selected?.status === "documentation" || selected?.status === "validation") return 3;
            return 1;
        }
        // Le diff prime : des modifications non commitées → commit, sinon → push
        if (diffContent.trim()) return 2;
        return 3;
    })();

    // Variante d'un bouton workflow selon sa position
    function btnVariant(idx: number): "active" | "secondary" | "disabled" {
        if (idx === currentStep) return "active";
        if (idx < currentStep) return "secondary";
        return "disabled";
    }

    const SELECTED_KEY = "claudicator:selected-task";

    onMount(async () => {
        await loadTasks();
        const savedId = localStorage.getItem(SELECTED_KEY);
        // Priorité : task "planification" > task sauvegardée > première task avec plan
        const toSelect = tasks.find(t => t.status === "planification")
            ?? (savedId ? tasks.find(t => t.id === savedId) : null)
            ?? tasks.find(t => t.hasPlan);
        if (toSelect) await selectTask(toSelect);
        tasksReady.set(true);
    });

    // Recharger les tasks quand la roadMap est fermée
    let _prevResult = $issueAnalysis.result;
    const _unsubAnalysis = issueAnalysis.subscribe(s => {
        if (_prevResult !== null && s.result === null && !s.running) loadTasksSilent();
        _prevResult = s.result;
    });
    onDestroy(_unsubAnalysis);

    // ⚠ Ne PAS lire selected/planContent/planLoading ici directement :
    // Svelte 4 les inclut comme dépendances et boucle à l'infini.
    // On délègue à une fonction pour isoler le scope de tracking.
    $: if ($taskRefreshTick) onRefreshTick();

    $: planModeTask.set(selected ? { id: selected.id, title: selected.title } : null);

    function onRefreshTick() {
        (async () => {
            await loadTasksSilent();
            if (selected && selected.status === "implementation" && !planContent && !planLoading) {
                await loadPlan(selected.id);
                if (planContent && selectedPanel === "plan") selectedPanel = "implement";
            }
        })();
    }

    async function loadTasks() {
        loading = true;
        try {
            const res = await fetch("/api/tasks");
            tasks = await res.json();
            if (selected) {
                const prev = selected.status;
                selected = tasks.find(t => t.id === selected!.id) ?? null;
                if (selected && selected.status !== prev) {
                    const f = statusToFilter(selected.status);
                    if (f) filter = f;
                }
            }
        } finally {
            loading = false;
        }
    }

    /** Refresh silencieux : ne cache pas la liste pendant le chargement. */
    async function loadTasksSilent() {
        try {
            const res = await fetch("/api/tasks");
            const fresh = await res.json();
            if (!Array.isArray(fresh)) return;
            tasks = fresh;
            if (selected) {
                const prev = selected.status;
                selected = tasks.find(t => t.id === selected!.id) ?? null;
                if (selected && selected.status !== prev) {
                    const f = statusToFilter(selected.status);
                    if (f) filter = f;
                }
            }
        } catch { /* silencieux */ }
    }

    async function createTask() {
        if (!newTitle.trim() || creating) return;
        creating = true;
        try {
            const issueNumber = $agentState.issue?.number;
            await fetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: newTitle.trim(), issueNumber }),
            });
            newTitle = "";
            await loadTasks();
        } finally {
            creating = false;
        }
    }

    async function remove(task: Task) {
        await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
        if (selected?.id === task.id) { selected = null; planContent = null; diffContent = null; }
        await loadTasks();
    }

    function onKey(e: KeyboardEvent) {
        if (e.key === "Enter") createTask();
    }

    async function loadPlan(taskId: string) {
        planLoading = true;
        planContent = null;
        try {
            const res = await fetch(`/api/tasks/${taskId}/plan`);
            const data = await res.json();
            planContent = data.content ?? null;
            if (planContent) implEdit = planContent;
        } catch { planContent = null; }
        finally { planLoading = false; }
    }

    async function loadDiff(taskId: string) {
        diffLoading = true;
        diffContent = null;
        const task = tasks.find(t => t.id === taskId);
        if (task && !commitMsg) {
            commitMsg = `feat: ${task.issueNumber ? `#${task.issueNumber} ` : ""}${task.title.slice(0, 60)}`;
        }
        try {
            const res = await fetch(`/api/tasks/${taskId}/diff`);
            const data = await res.json();
            if (data.error) { wfError = data.error; return; }
            diffContent = data.diff ?? "";
        } catch (e: any) {
            wfError = e.message;
        } finally {
            diffLoading = false;
        }
    }

    async function selectTask(initialTask: Task) {
        if (selected?.id === initialTask.id) {
            selected = null; planContent = null; diffContent = null;
            implEdit = ""; commitMsg = ""; selectedPanel = "plan"; wfError = "";
            localStorage.removeItem(SELECTED_KEY);
            return;
        }
        localStorage.setItem(SELECTED_KEY, initialTask.id);
        selected = initialTask;
        planContent = null; diffContent = null;
        implEdit = ""; commitMsg = ""; wfError = ""; revertConfirm = false;
        selectedPanel = "plan";
        linkedIssueState = null;

        let task = initialTask;

        if (task.issueNumber) loadLinkedIssueState(task.issueNumber);

        // Synchronise l'état git avant de charger le diff
        if (task.branch) {
            try {
                const syncRes = await fetch(`/api/tasks/${task.id}/sync`, { method: "POST" });
                const synced = await syncRes.json();
                if (synced && !synced.error) {
                    tasks = tasks.map(t => t.id === synced.id ? synced : t);
                    selected = synced;
                    task = synced;
                }
            } catch { /* silencieux */ }
        }

        const toLoad: Promise<void>[] = [loadPlan(task.id)];
        if (task.branch) toLoad.push(loadDiff(task.id));
        await Promise.all(toLoad);

        // Auto-avance l'étape affichée
        if (task.status === "documentation" || task.status === "validation") {
            selectedPanel = diffContent?.trim() ? "commit" : "push";
        } else if (task.branch && diffContent !== null) {
            selectedPanel = diffContent.trim() ? "commit" : "push";
        } else if (planContent) {
            selectedPanel = "implement";
        }

        if (task.issueNumber) {
            agentState.update(s => ({ ...s, status: "loading", plan: null }));
            const res = await fetch(`/api/issue?number=${task.issueNumber}`);
            const full = await res.json();
            agentState.update(s => ({
                ...s, issue: full, status: "idle", navigationStack: [],
                knownSubIssueNumbers: [
                    ...new Set([...s.knownSubIssueNumbers, ...(full.subIssues?.map((si: any) => si.number) ?? [])])
                ]
            }));
        }
    }

    async function clickImplement(task: Task) {
        if (!implEdit.trim() || $agentRunState.running) return;
        wfError = "";

        // Initial commit si pas encore de branche
        if (!task.branch) {
            initialCommitting = true;
            try {
                const res = await fetch(`/api/tasks/${task.id}/initial-commit`, { method: "POST" });
                const data = await res.json();
                if (data.error && res.status !== 409) { wfError = data.error; return; }
                await loadTasks();
            } finally {
                initialCommitting = false;
            }
        }

        agentRunState.set({ taskId: task.id, taskTitle: task.title, logs: [], running: true });
        try {
            const res = await fetch("/api/agent/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: implEdit, taskId: task.id })
            });
            if (!res.ok || !res.body) { agentRunState.update(s => ({ ...s, running: false })); return; }
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                for (const raw of dec.decode(value).split("\n")) {
                    if (raw.startsWith("data: ")) {
                        try { agentRunState.update(s => ({ ...s, logs: [...s.logs, JSON.parse(raw.slice(6))] })); }
                        catch { }
                    }
                }
            }
        } finally {
            agentRunState.update(s => ({ ...s, running: false }));
            taskRefreshTick.update(n => n + 1);
            if (selected?.id === task.id) {
                await loadDiff(task.id);
                selectedPanel = "commit";
            }
        }
    }

    async function commitChanges(task: Task) {
        if (!commitMsg.trim() || committing) return;
        committing = true; wfError = "";
        try {
            const res = await fetch(`/api/tasks/${task.id}/commit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: commitMsg.trim() })
            });
            const data = await res.json();
            if (data.error) { wfError = data.error; return; }
            commitMsg = "";
            await Promise.all([loadDiff(task.id), loadTasksSilent()]);
            selectedPanel = diffContent?.trim() ? "commit" : "push";
        } catch (e: any) {
            wfError = e.message;
        } finally { committing = false; }
    }

    async function revertChanges(task: Task) {
        if (!revertConfirm) { revertConfirm = true; return; }
        revertConfirm = false; reverting = true; wfError = "";
        try {
            const res = await fetch(`/api/tasks/${task.id}/revert`, { method: "POST" });
            const data = await res.json();
            if (data.error) { wfError = data.error; return; }
            await loadDiff(task.id);
            selectedPanel = "commit";
        } catch (e: any) {
            wfError = e.message;
        } finally { reverting = false; }
    }

    async function pushBranch(task: Task) {
        if (pushing) return;
        pushing = true; wfError = "";
        try {
            const res = await fetch(`/api/tasks/${task.id}/push`, { method: "POST" });
            const data = await res.json();
            if (data.error) { wfError = data.error; return; }
            const prev = selected?.id === task.id ? selected?.status : undefined;
            tasks = tasks.map(t => t.id === data.id ? data : t);
            if (selected?.id === task.id) {
                selected = data;
                if (prev && data.status !== prev) {
                    const f = statusToFilter(data.status);
                    if (f) filter = f;
                }
            }
        } catch (e: any) {
            wfError = e.message;
        } finally { pushing = false; }
    }

    async function mergeBranch(task: Task) {
        if (merging) return;
        merging = true; wfError = "";
        try {
            const res = await fetch(`/api/tasks/${task.id}/merge`, { method: "POST" });
            const data = await res.json();
            if (data.error) { wfError = data.error; return; }
            selected = null;
            planContent = null;
            diffContent = null;
            implEdit = "";
            commitMsg = "";
            localStorage.removeItem(SELECTED_KEY);
            await loadTasks();
        } catch (e: any) {
            wfError = e.message;
        } finally { merging = false; }
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

    <div class="new-task">
        <input
            class="new-input"
            placeholder="Nouvelle task…"
            bind:value={newTitle}
            onkeydown={onKey}
            disabled={creating}
        />
    </div>

    <div class="list">
        {#if loading}
            <p class="hint">Chargement…</p>
        {:else if filtered.length === 0}
            <p class="hint">Aucune task</p>
        {:else}
            {#each filtered as task}
                <div
                    class="task-row-wrap"
                    onmouseenter={() => task.issueNumber && hoveredIssueNumber.set(task.issueNumber)}
                    onmouseleave={() => hoveredIssueNumber.set(null)}
                >
                    <ItemRow
                        prefix={taskPrefix(task)}
                        title={task.title}
                        labels={rowLabels(task, selected?.id === task.id)}
                        pipelineStep={(task.status !== "failed" && task.status !== "merged") ? taskPipelineStep(task) : null}
                        state={(task.status === "failed" || task.status === "merged") ? "closed" : "open"}
                        active={selected?.id === task.id || ($planAllState.running && $planAllState.currentTaskId === task.id)}
                        onclick={() => selectTask(task)}
                    />
                    <button
                        class="task-delete-btn"
                        onclick={(e) => { e.stopPropagation(); remove(task); }}
                        title="Supprimer"
                    >✕</button>
                </div>

                {#if selected?.id === task.id}
                    <div class="inline-detail">

                        {#if task.status !== "merged"}

                        <!-- ── Task bloquée / échouée ── -->
                        {#if task.status === "planification" || task.status === "failed"}
                            <div class="stuck-bar">
                                <span class="stuck-label">
                                    {task.status === "planification" ? "⚠ agent inactif — task bloquée" : "✕ échec"}
                                </span>
                                <button
                                    class="stuck-reset"
                                    onclick={() => resetTask(task)}
                                    disabled={resetting}
                                >{resetting ? "…" : "↺ Réinitialiser → spécification"}</button>
                            </div>
                        {/if}

                        <!-- ── Barre workflow ── -->
                        <div class="wf-bar">
                            <button
                                class="wf-btn"
                                class:wf-active={btnVariant(0) === "active"}
                                class:wf-secondary={btnVariant(0) === "secondary"}
                                class:wf-disabled={btnVariant(0) === "disabled"}
                                onclick={() => selectedPanel = "plan"}
                            >{currentStep > 0 ? "Re-planifier" : "Planifier"}</button>

                            <span class="wf-arrow">›</span>

                            <button
                                class="wf-btn"
                                class:wf-active={btnVariant(1) === "active"}
                                class:wf-secondary={btnVariant(1) === "secondary"}
                                class:wf-disabled={btnVariant(1) === "disabled"}
                                disabled={btnVariant(1) === "disabled"}
                                onclick={() => selectedPanel = "implement"}
                            >Implémenter</button>

                            <span class="wf-arrow">›</span>

                            <button
                                class="wf-btn"
                                class:wf-active={btnVariant(2) === "active"}
                                class:wf-secondary={btnVariant(2) === "secondary"}
                                class:wf-disabled={btnVariant(2) === "disabled" && !planContent}
                                disabled={branchCreating || (!task.branch && !planContent)}
                                onclick={() => task.branch ? (selectedPanel = "commit") : createBranchAndShowDiff(task)}
                            >{branchCreating ? "Création…" : "Commiter"}</button>

                            <span class="wf-arrow">›</span>

                            <button
                                class="wf-btn"
                                class:wf-active={btnVariant(3) === "active"}
                                class:wf-secondary={btnVariant(3) === "secondary"}
                                class:wf-disabled={btnVariant(3) === "disabled"}
                                disabled={btnVariant(3) === "disabled"}
                                onclick={() => selectedPanel = "push"}
                            >Push</button>

                            <span class="wf-arrow">›</span>

                            <button class="wf-btn wf-disabled" disabled>Merge</button>

                        </div>

                        {#if wfError}
                            <div class="wf-error">{wfError}</div>
                        {/if}

                        <!-- ── Contenu ── -->
                        {#if selectedPanel === "plan"}
                            <div class="plan-scene-hint">↗ Scène principale</div>
                            {#if task.planUsage}
                                <PromptUsage usage={task.planUsage} totalUsage={task.totalUsage} label="Plan" />
                            {/if}

                        {:else if selectedPanel === "implement"}
                            <div class="impl-panel">
                                <textarea
                                    class="impl-textarea"
                                    bind:value={implEdit}
                                    rows={10}
                                    placeholder={planLoading ? "Chargement du plan…" : "Coller ou écrire le plan…"}
                                    disabled={planLoading}
                                ></textarea>
                                <div class="impl-footer">
                                    {#if task.branch}
                                        <button
                                            class="impl-skip"
                                            onclick={() => selectedPanel = "commit"}
                                        >→ Commiter</button>
                                    {:else if planContent}
                                        <button
                                            class="impl-skip"
                                            onclick={() => createBranchAndShowDiff(task)}
                                            disabled={branchCreating}
                                        >{branchCreating ? "Création branche…" : "→ Créer branche + diff"}</button>
                                    {/if}
                                    <button
                                        class="impl-launch"
                                        onclick={() => clickImplement(task)}
                                        disabled={!implEdit.trim() || $agentRunState.running || initialCommitting}
                                    >
                                        {#if initialCommitting}
                                            Création branche…
                                        {:else if $agentRunState.running}
                                            En cours…
                                        {:else}
                                            <span class="impl-launch-label">Lancer l'agent</span><span class="impl-launch-arrow"> →</span>
                                        {/if}
                                    </button>
                                </div>
                                {#if task.implUsage}
                                    <PromptUsage usage={task.implUsage} totalUsage={task.totalUsage} label="Implémentation" />
                                {/if}
                            </div>

                        {:else if selectedPanel === "commit"}
                            <div class="commit-panel">
                                <div class="commit-bar">
                                    <input
                                        class="commit-msg-input"
                                        placeholder="Message de commit…"
                                        bind:value={commitMsg}
                                        disabled={committing}
                                    />
                                    <button
                                        class="commit-btn"
                                        onclick={() => commitChanges(task)}
                                        disabled={!commitMsg.trim() || committing}
                                    >{committing ? "…" : "✓ Commiter"}</button>
                                    <button
                                        class="revert-btn"
                                        onclick={() => revertChanges(task)}
                                        disabled={reverting}
                                    >{reverting ? "…" : revertConfirm ? "Confirmer ?" : "✕ Annuler"}</button>
                                    <button class="diff-refresh-btn" onclick={() => loadDiff(task.id)} title="Rafraîchir">↺</button>
                                </div>
                                {#if diffLoading}
                                    <span class="diff-hint">Chargement du diff…</span>
                                {:else if diffContent !== null}
                                    {#if diffContent.trim()}
                                        <div class="diff-view">
                                            {#each diffContent.split('\n') as line}
                                                <div
                                                    class="diff-line"
                                                    class:add={line.startsWith('+') && !line.startsWith('+++')}
                                                    class:del={line.startsWith('-') && !line.startsWith('---')}
                                                    class:hunk={line.startsWith('@@')}
                                                    class:meta={line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')}
                                                >{line || '\u200b'}</div>
                                            {/each}
                                        </div>
                                    {:else}
                                        <span class="diff-hint">Aucune modification non commitée</span>
                                    {/if}
                                {/if}
                            </div>

                        {:else if selectedPanel === "push"}
                            <div class="push-panel">
                                <span class="push-hint">Tous les commits sont prêts sur <code>{task.branch}</code></span>
                                <div class="push-actions">
                                    <button
                                        class="wf-btn"
                                        class:wf-active={!task.pushed && !pushing}
                                        class:wf-secondary={task.pushed}
                                        onclick={() => pushBranch(task)}
                                        disabled={pushing}
                                    >{pushing ? "…" : task.pushed ? "✓ Pushé" : "↑ Push"}</button>
                                    <button
                                        class="wf-btn"
                                        class:wf-active={task.pushed && !merging}
                                        class:wf-disabled={!task.pushed}
                                        onclick={() => mergeBranch(task)}
                                        disabled={!task.pushed || merging}
                                    >{merging ? "…" : "⇒ Merge → main"}</button>
                                    {#if task.issueNumber && linkedIssueState === "open"}
                                        <button
                                            class="wf-btn close-issue-btn"
                                            onclick={() => closeLinkedIssue(task)}
                                            disabled={closingIssue}
                                            title="Fermer l'issue #{task.issueNumber} sur GitHub"
                                        >{closingIssue ? "…" : "✕ Fermer #" + task.issueNumber}</button>
                                    {:else if task.issueNumber && linkedIssueState === "closed"}
                                        <span class="wf-btn wf-secondary" style="cursor:default">✓ Issue fermée</span>
                                    {/if}
                                </div>
                            </div>
                        {/if}

                        {/if}<!-- /merged guard -->

                    </div>
                {/if}
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
.filter-btn.task-current { color: cornsilk; }
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
.new-task { border-bottom: 1px solid var(--border); flex-shrink: 0; }
.new-input {
    display: block;
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-muted);
    font-family: 'Inter', sans-serif;
    font-size: 0.68rem;
    letter-spacing: 0.05em;
    padding: 0.6rem 1rem;
    box-sizing: border-box;
}
.new-input:focus { color: #aaa; }
.new-input::placeholder { color: var(--border-strong); }
.list { flex: 1; min-height: 0; overflow-y: auto; }
.list::-webkit-scrollbar { width: 4px; }
.list::-webkit-scrollbar-track { background: transparent; }
.list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.task-row-wrap { position: relative; }
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

/* ── Détail inline ── */
.inline-detail {
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
}
.inline-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0.35rem 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
}
.meta-tag {
    font-size: 0.6rem;
    padding: 0.05rem 0.4rem;
    border-radius: 10px;
    background: var(--bg-subtle);
    color: var(--text-muted);
    border: 1px solid var(--border-strong);
}
.meta-tag.mono { font-family: 'JetBrains Mono', monospace; background: none; border-color: transparent; padding-left: 0; padding-right: 0; }
.meta-tag.dim { color: #333; background: none; border-color: transparent; padding-left: 0; padding-right: 0; }
.meta-tag.meta-tokens { color: #3a3a5a; font-family: 'JetBrains Mono', monospace; cursor: help; }
.meta-tag.meta-issue { display: inline-flex; align-items: center; gap: 0.3rem; }
.issue-state { font-size: 0.55rem; padding: 0.05rem 0.3rem; border-radius: 2px; }
.issue-state.open { color: #4caf50; background: rgba(76,175,80,0.1); }
.issue-state.closed { color: #7c6af7; background: rgba(124,106,247,0.1); }
.close-issue-btn { color: #a04040 !important; border-color: #3a2a2a !important; }
.close-issue-btn:hover:not(:disabled) { color: #f44336 !important; border-color: #f44336 !important; }

/* ── Task bloquée ── */
.stuck-bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 1rem;
    border-bottom: 1px solid #2a1a1a;
    background: #110808;
}
.stuck-label {
    font-size: 0.6rem;
    color: #7a3a2a;
    font-style: italic;
    flex: 1;
}
.stuck-reset {
    background: none;
    border: 1px solid #3a2020;
    color: #a05040;
    font-size: 0.6rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    white-space: nowrap;
    flex-shrink: 0;
}
.stuck-reset:hover:not(:disabled) { color: #f44336; border-color: #f44336; }
.stuck-reset:disabled { opacity: 0.4; cursor: default; }

/* ── Barre workflow ── */
.wf-bar {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
}
.wf-bar::-webkit-scrollbar { display: none; }
.wf-arrow {
    color: var(--border);
    font-size: 0.85rem;
    flex-shrink: 0;
    padding: 0 0.2rem;
    line-height: 1;
}
.wf-btn {
    background: none;
    border: 1px solid transparent;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 0.04em;
    padding: 0.2rem 0.55rem;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: color 0.15s, border-color 0.15s;
}
/* active = étape courante */
.wf-btn.wf-active {
    color: var(--accent-hover);
    border-color: transparent;
    background: none;
}
.wf-btn.wf-active:hover { color: #b0a0ff; }
/* secondary = étape déjà franchie, recliquable */
.wf-btn.wf-secondary {
    color: #444;
    border-color: transparent;
    cursor: pointer;
}
.wf-btn.wf-secondary:hover { color: #777; border-color: #333; }
.wf-sep {
    color: var(--border);
    font-size: 0.7rem;
    flex-shrink: 0;
    padding: 0 0.4rem;
    line-height: 1;
    user-select: none;
}
/* disabled = pas encore accessible */
.wf-btn.wf-disabled {
    color: #222;
    border-color: transparent;
    cursor: default;
    pointer-events: none;
}

/* ── Erreur workflow ── */
.wf-error {
    padding: 0.3rem 1rem;
    font-size: 0.62rem;
    color: #f44336;
    font-style: italic;
    border-bottom: 1px solid #1a1a1a;
}

/* ── Panneau Implémenter ── */
.impl-panel { display: flex; flex-direction: column; border-top: 1px solid var(--border); }
.impl-textarea {
    background: var(--bg-deep);
    border: none;
    border-bottom: 1px solid var(--border);
    color: #777;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.67rem;
    line-height: 1.55;
    padding: 0.5rem 1rem;
    resize: vertical;
    outline: none;
    min-height: 80px;
}
.impl-textarea:focus { color: #bbb; }
.impl-textarea::placeholder { color: var(--border-strong); }
.impl-textarea:disabled { opacity: 0.5; cursor: wait; }
.impl-footer { display: flex; justify-content: flex-end; align-items: center; gap: 0.5rem; padding: 0.4rem 1rem; flex-shrink: 0; }
.impl-skip {
    margin-right: auto;
    background: none;
    border: 1px solid #2a3a2a;
    color: #4a7a4a;
    font-size: 0.6rem;
    padding: 0.2rem 0.55rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: color 0.1s, border-color 0.1s;
}
.impl-skip:hover { color: #7cbf7c; border-color: #4a7a4a; }
.impl-launch {
    background: #1e1540;
    border: 1px solid #3a2e70;
    border-radius: 3px;
    font-size: 0.65rem;
    padding: 0.3rem 0.9rem;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    letter-spacing: 0.03em;
    display: inline-flex;
    align-items: center;
}
.impl-launch-label { color: cornsilk; }
.impl-launch-arrow { color: #fff; }
.impl-launch:hover:not(:disabled) { background: #2a1e58; border-color: #5a4a9a; }
.impl-launch:disabled { opacity: 0.35; cursor: default; }

/* ── Panneau Commit ── */
.commit-panel { display: flex; flex-direction: column; border-top: 1px solid var(--border); }
.commit-bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}
.commit-msg-input {
    flex: 1;
    min-width: 0;
    background: var(--bg-deep);
    border: 1px solid var(--border-strong);
    border-radius: 3px;
    color: #888;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.63rem;
    padding: 0.25rem 0.5rem;
    outline: none;
}
.commit-msg-input:focus { border-color: #4caf50; color: #bbb; }
.commit-msg-input::placeholder { color: var(--border-strong); }
.commit-msg-input:disabled { opacity: 0.4; }
.commit-btn {
    background: none;
    border: 1px solid #2a4a2a;
    color: #4caf50;
    font-size: 0.62rem;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
}
.commit-btn:hover:not(:disabled) { border-color: #4caf50; }
.commit-btn:disabled { opacity: 0.35; cursor: default; }
.revert-btn {
    background: none;
    border: 1px solid var(--border-strong);
    color: #555;
    font-size: 0.6rem;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
}
.revert-btn:hover:not(:disabled) { color: #f44336; border-color: #f44336; }
.revert-btn:disabled { opacity: 0.35; cursor: default; }
.diff-refresh-btn {
    background: none;
    border: none;
    color: #2a2a3a;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    flex-shrink: 0;
}
.diff-refresh-btn:hover { color: #555; }
.diff-view {
    max-height: 320px;
    overflow-y: auto;
    padding: 0.4rem 0;
    background: var(--bg-deep);
}
.diff-view::-webkit-scrollbar { width: 3px; }
.diff-view::-webkit-scrollbar-thumb { background: var(--border); }
.diff-line {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.63rem;
    line-height: 1.5;
    padding: 0 1rem;
    white-space: pre;
    overflow-x: hidden;
    text-overflow: ellipsis;
    color: #555;
}
.diff-line.add { color: #4caf50; background: rgba(76,175,80,0.05); }
.diff-line.del { color: #f44336; background: rgba(244,67,54,0.05); }
.diff-line.hunk { color: #7c6af7; }
.diff-line.meta { color: #2a2a2a; }
.diff-hint {
    display: block;
    padding: 0.4rem 1rem;
    font-size: 0.62rem;
    color: #333;
    font-style: italic;
}

/* ── Placeholder plan scène ── */
.plan-scene-hint {
    padding: 0.6rem 1rem;
    font-size: 0.6rem;
    color: var(--border-strong);
    font-style: italic;
    font-family: 'JetBrains Mono', monospace;
    border-top: 1px solid var(--border);
}

/* ── Panneau Push ── */
.push-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid #141414;
}
.push-hint {
    font-size: 0.65rem;
    color: #3a3a5a;
    font-style: italic;
}
.push-hint code {
    font-family: 'JetBrains Mono', monospace;
    color: var(--text-muted);
    background: var(--bg-subtle);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
}
.push-actions { display: flex; gap: 0.5rem; }

</style>
