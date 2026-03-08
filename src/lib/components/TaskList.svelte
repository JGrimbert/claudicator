<script lang="ts">
    import { onMount } from "svelte";
    import { agentState, taskRefreshTick, agentRunState, type Issue } from "$lib/stores/agent";
    import ItemRow from "$lib/components/ItemRow.svelte";
    import AgentInput from "$lib/components/AgentInput.svelte";

    type TaskStatus = "pending" | "running" | "done" | "failed";
    type Task = {
        id: string;
        title: string;
        status: TaskStatus;
        issueNumber?: number;
        branch?: string;
        logs: string[];
        createdAt: string;
        updatedAt: string;
    };
    type WfPanel = "plan" | "implement" | "commit" | "push";

    const STATUS_LABEL: Record<TaskStatus, string> = {
        pending: "en attente",
        running: "en cours",
        done:    "terminé",
        failed:  "échoué",
    };
    const STATUS_COLOR: Record<TaskStatus, string> = {
        pending: "555555",
        running: "f7c948",
        done:    "4caf50",
        failed:  "f44336",
    };
    const FILTERS = ["all", "running", "pending", "done", "failed"] as const;
    type Filter = typeof FILTERS[number];

    let tasks: Task[] = [];
    let loading = true;
    let filter: Filter = "all";
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

    $: filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);
    $: countOf = (f: Filter) => f === "all" ? tasks.length : tasks.filter(t => t.status === f).length;

    // Index de l'étape courante (0=plan, 1=impl, 2=commit, 3=push)
    $: currentStep = (() => {
        if (!planContent) return 0;
        if (!selected?.branch) return 1;
        if (diffLoading || diffContent === null) return 1;
        if (diffContent.trim()) return 2;
        return 3;
    })();

    // Variante d'un bouton workflow selon sa position
    function btnVariant(idx: number): "active" | "secondary" | "disabled" {
        if (idx === currentStep) return "active";
        if (idx < currentStep) return "secondary";
        return "disabled";
    }

    onMount(() => { loadTasks(); });

    // ⚠ Ne PAS lire selected/planContent/planLoading ici directement :
    // Svelte 4 les inclut comme dépendances et boucle à l'infini.
    // On délègue à une fonction pour isoler le scope de tracking.
    $: if ($taskRefreshTick) onRefreshTick();

    function onRefreshTick() {
        (async () => {
            await loadTasksSilent();
            if (selected && selected.status === "done" && !planContent && !planLoading) {
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
            if (selected) selected = tasks.find(t => t.id === selected!.id) ?? null;
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
            if (selected) selected = tasks.find(t => t.id === selected!.id) ?? null;
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

    async function selectTask(task: Task) {
        if (selected?.id === task.id) {
            selected = null; planContent = null; diffContent = null;
            implEdit = ""; commitMsg = ""; selectedPanel = "plan"; wfError = "";
            return;
        }
        selected = task;
        planContent = null; diffContent = null;
        implEdit = ""; commitMsg = ""; wfError = ""; revertConfirm = false;
        selectedPanel = "plan";

        const toLoad: Promise<void>[] = [loadPlan(task.id)];
        if (task.branch) toLoad.push(loadDiff(task.id));
        await Promise.all(toLoad);

        // Auto-avance l'étape affichée
        if (task.branch && diffContent !== null) {
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

        const currentTask = tasks.find(t => t.id === task.id) ?? task;
        const prompt = [
            "TASK", currentTask.title, "",
            "OBJECTIF",
            "Implémenter le plan ci-dessous étape par étape. Modifier le code dans le projet.",
            "Ne pas produire de plan. Réaliser directement les modifications.", "",
            "PLAN APPROUVÉ", implEdit
        ].join("\n");

        agentRunState.set({ taskId: task.id, taskTitle: task.title, logs: [], running: true });
        try {
            const res = await fetch("/api/agent/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt, taskId: task.id })
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
                selectedPanel = diffContent?.trim() ? "commit" : "push";
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
            await loadDiff(task.id);
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
</script>

<div class="panel">
    <div class="panel-header">Tasks</div>

    <div class="filter-bar">
        {#each FILTERS as f}
            <button class="filter-btn" class:active={filter === f} onclick={() => filter = f}>
                {f === "all" ? "toutes" : STATUS_LABEL[f as TaskStatus]}
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
                <div class="task-row-wrap">
                    <ItemRow
                        prefix={task.issueNumber ? `#${task.issueNumber}` : ""}
                        title={task.title}
                        labels={[{ name: STATUS_LABEL[task.status], color: STATUS_COLOR[task.status] }]}
                        state={task.status === "failed" ? "closed" : "open"}
                        active={selected?.id === task.id}
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

                        <!-- ── Meta ── -->
                        <div class="inline-meta">
                            {#if task.issueNumber}<span class="meta-tag">#{task.issueNumber}</span>{/if}
                            {#if task.branch}<span class="meta-tag mono">{task.branch}</span>{/if}
                            <span class="meta-tag dim">{new Date(task.createdAt).toLocaleDateString("fr-FR")}</span>
                            <span class="meta-tag" style="color:#{STATUS_COLOR[task.status]};border-color:#1a1a1a">{STATUS_LABEL[task.status]}</span>
                        </div>

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
                                class:wf-disabled={btnVariant(2) === "disabled"}
                                disabled={btnVariant(2) === "disabled"}
                                onclick={() => selectedPanel = "commit"}
                            >Commiter</button>

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
                            <AgentInput {task} />

                        {:else if selectedPanel === "implement"}
                            <div class="impl-panel">
                                <div class="impl-header">
                                    <span class="impl-label">Plan approuvé</span>
                                    <span class="impl-hint">Éditable avant lancement</span>
                                    {#if planLoading}<span class="impl-hint">Chargement…</span>{/if}
                                </div>
                                <textarea
                                    class="impl-textarea"
                                    bind:value={implEdit}
                                    rows={10}
                                    placeholder={planLoading ? "Chargement du plan…" : "Coller ou écrire le plan…"}
                                    disabled={planLoading}
                                ></textarea>
                                <div class="impl-footer">
                                    <button
                                        class="impl-launch"
                                        onclick={() => clickImplement(task)}
                                        disabled={!implEdit.trim() || $agentRunState.running || initialCommitting}
                                    >
                                        {initialCommitting ? "Création branche…" : $agentRunState.running ? "En cours…" : "Lancer l'implémentation →"}
                                    </button>
                                </div>
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
                                    <button class="wf-btn wf-disabled" disabled title="Bientôt disponible">↑ Push</button>
                                    <button class="wf-btn wf-disabled" disabled title="Bientôt disponible">⇒ Merge → main</button>
                                </div>
                            </div>
                        {/if}

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
    color: #555;
    border-bottom: 1px solid #1e1e1e;
    flex-shrink: 0;
}
.filter-bar {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #1a1a1a;
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: none;
}
.filter-bar::-webkit-scrollbar { display: none; }
.filter-btn {
    background: none;
    border: none;
    border-right: 1px solid #1a1a1a;
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
.new-task { border-bottom: 1px solid #1a1a1a; flex-shrink: 0; }
.new-input {
    display: block;
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: #555;
    font-family: 'Inter', sans-serif;
    font-size: 0.68rem;
    letter-spacing: 0.05em;
    padding: 0.6rem 1rem;
    box-sizing: border-box;
}
.new-input:focus { color: #aaa; }
.new-input::placeholder { color: #222; }
.list { flex: 1; min-height: 0; overflow-y: auto; }
.list::-webkit-scrollbar { width: 4px; }
.list::-webkit-scrollbar-track { background: transparent; }
.list::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 2px; }
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
    background: #0d0d16;
    border-bottom: 1px solid #1a1a1a;
    border-left: 2px solid #7c6af7;
}
.inline-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0.35rem 1rem;
    border-bottom: 1px solid #141414;
}
.meta-tag {
    font-size: 0.6rem;
    padding: 0.05rem 0.4rem;
    border-radius: 10px;
    background: #1a1a2e;
    color: #555;
    border: 1px solid #2a2a2a;
}
.meta-tag.mono { font-family: 'JetBrains Mono', monospace; }
.meta-tag.dim { color: #333; }

/* ── Barre workflow ── */
.wf-bar {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid #141414;
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
}
.wf-bar::-webkit-scrollbar { display: none; }
.wf-arrow {
    color: #1e1e2e;
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
    color: #9181f9;
    border-color: #3a2a5a;
    background: #0e0b1a;
}
.wf-btn.wf-active:hover { border-color: #7c6af7; }
/* secondary = étape déjà franchie, recliquable */
.wf-btn.wf-secondary {
    color: #444;
    border-color: #1e1e2e;
    cursor: pointer;
}
.wf-btn.wf-secondary:hover { color: #777; border-color: #333; }
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
.impl-panel { display: flex; flex-direction: column; border-top: 1px solid #141414; }
.impl-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 1rem;
    border-bottom: 1px solid #111;
}
.impl-label {
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #333;
}
.impl-hint { font-size: 0.6rem; color: #2a2a2a; font-style: italic; }
.impl-textarea {
    background: #07070f;
    border: none;
    border-bottom: 1px solid #111;
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
.impl-textarea::placeholder { color: #222; }
.impl-textarea:disabled { opacity: 0.5; cursor: wait; }
.impl-footer { display: flex; justify-content: flex-end; padding: 0.4rem 1rem; flex-shrink: 0; }
.impl-launch {
    background: #7c6af7;
    border: none;
    border-radius: 3px;
    color: #fff;
    font-size: 0.65rem;
    padding: 0.3rem 0.9rem;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    letter-spacing: 0.03em;
}
.impl-launch:hover:not(:disabled) { background: #9181f9; }
.impl-launch:disabled { opacity: 0.35; cursor: default; }

/* ── Panneau Commit ── */
.commit-panel { display: flex; flex-direction: column; border-top: 1px solid #141414; }
.commit-bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid #141414;
    flex-shrink: 0;
}
.commit-msg-input {
    flex: 1;
    min-width: 0;
    background: #070710;
    border: 1px solid #2a2a3a;
    border-radius: 3px;
    color: #888;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.63rem;
    padding: 0.25rem 0.5rem;
    outline: none;
}
.commit-msg-input:focus { border-color: #4caf50; color: #bbb; }
.commit-msg-input::placeholder { color: #2a2a3a; }
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
    border: 1px solid #2a2a2a;
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
    background: #050510;
}
.diff-view::-webkit-scrollbar { width: 3px; }
.diff-view::-webkit-scrollbar-thumb { background: #1a1a2a; }
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
    color: #555;
    background: #1a1a2e;
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
}
.push-actions { display: flex; gap: 0.5rem; }
</style>
