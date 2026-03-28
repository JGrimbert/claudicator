<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { get } from "svelte/store";
    import { agentState, taskRefreshTick, issueListRefreshTick, pendingSelectTaskId, agentRunState, hoveredIssueNumber, planGroups, planModeTask, planAllState, issueAnalysis, tasksReady, consoleTab, taskIssueNumbers, activeFullPlan, startConsoleStream, testRunState, type TestLog, type Issue } from "$lib/stores/agent";
    import { JgrItem } from 'jgr-ui';
    import PromptUsage from "$lib/components/PromptUsage.svelte";
    import Fuse from 'fuse.js';


    type TaskStatus = "specification" | "planification" | "implementation" | "documentation" | "validation" | "merged" | "failed";
    type TaskType = "standard" | "fullplan";
    type TokenUsage = { inputTokens: number; outputTokens: number };
    type PatchInfo = { name: string; issueNumber?: number; hasTests: boolean; createdAt: number };
    type IssueRef = { number: number; title: string };
    type FullPlanDetail = { id: string; subStacks: { keyword: string; issues: IssueRef[] }[]; residualIssues?: IssueRef[] };
    type IssueState = "patch-tests" | "patch-no-tests" | "no-patch";
    type IssueRow = IssueRef & { stack: string; state: IssueState; patch?: PatchInfo };
    type Task = {
        id: string;
        title: string;
        status: TaskStatus;
        type?: TaskType;
        fullPlanId?: string;
        issueNumber?: number;
        branch?: string;
        pushed?: boolean;
        logs: string[];
        usage?: TokenUsage;
        totalUsage?: TokenUsage;
        planUsage?: TokenUsage;
        implUsage?: TokenUsage;
        hasPlan?: boolean;
        hasPatch?: boolean;
        atlasEnabled?: boolean;
        createdAt: string;
        updatedAt: string;
    };
    type WfPanel = "plan" | "implement" | "commit" | "push" | "patch";

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

    function taskToFilter(task: Task): Filter | null {
        if (task.status === "planification" && task.hasPlan) return "implementation";
        if (task.status === "specification" || task.status === "planification") return "specification";
        if (task.status === "implementation") return "implementation";
        if (task.status === "documentation" || task.status === "validation") return "validation";
        if (task.status === "merged") return "merged";
        return null;
    }

    let tasks: Task[] = [];
    let loading = true;
    let filter: Filter | null = null;
    $: selectedTaskFilter = selected ? taskToFilter(selected) : null;
    let selected: Task | null = null;
    let filterQuery = "";


    // Workflow state
    let selectedPanel: WfPanel = "plan";
    let wfError = "";

    // Plan
    let planContent: string | null = null;
    let planLoading = false;

    // Fullplan detail + issue status
    let fullPlanDetail: FullPlanDetail | null = null;
    let closingIssues = false;

    async function closeFullPlanIssues(task: Task) {
        if (!task.fullPlanId || closingIssues) return;
        closingIssues = true; wfError = "";
        try {
            const res = await fetch(`/api/issues/groups/full-plans/${task.fullPlanId}/close-issues`, { method: "POST" });
            const data = await res.json();
            if (!res.ok) wfError = data.message ?? "Erreur fermeture issues";
        } catch (e: any) { wfError = e.message; }
        finally { closingIssues = false; }
    }
    $: issueRows = ((): IssueRow[] => {
        if (!fullPlanDetail) return [];
        const rows: IssueRow[] = [];
        for (const stack of fullPlanDetail.subStacks) {
            for (const issue of stack.issues) {
                const patch = patches.find(p => p.issueNumber === issue.number);
                const state: IssueState = patch ? (patch.hasTests ? "patch-tests" : "patch-no-tests") : "no-patch";
                rows.push({ ...issue, stack: stack.keyword, state, patch });
            }
        }
        for (const issue of (fullPlanDetail.residualIssues ?? [])) {
            const patch = patches.find(p => p.issueNumber === issue.number);
            const state: IssueState = patch ? (patch.hasTests ? "patch-tests" : "patch-no-tests") : "no-patch";
            rows.push({ ...issue, stack: "résiduel", state, patch });
        }
        return rows;
    })();

    // Patches
    let patches: PatchInfo[] = [];
    let selectedPatch: PatchInfo | null = null;
    let patchContent: string | null = null;
    let patchLoading = false;
    let patchApplying = false;

    // Sandbox (appliquer/retirer un patch dans le repo cible pour tester)
    type SandboxState = { applied: string[]; deps: Record<string, string[]> };
    let sandboxState: SandboxState | null = null;
    let sandboxError = "";
    let sandboxBusy: string | null = null; // nom du patch en cours d'opération

    async function loadPatches(taskId: string) {
        const res = await fetch(`/api/tasks/${taskId}/patches`);
        if (res.ok) patches = await res.json();
    }

    async function loadSandboxState(taskId: string) {
        const res = await fetch(`/api/tasks/${taskId}/patches/sandbox`);
        if (res.ok) sandboxState = await res.json();
    }

    async function sandboxApply(task: Task, patchName: string) {
        if (sandboxBusy) return;
        sandboxBusy = patchName; sandboxError = "";
        try {
            const res = await fetch(`/api/tasks/${task.id}/patches/${encodeURIComponent(patchName)}/sandbox`, { method: "POST" });
            const data = await res.json();
            if (data.error === "dirty") {
                sandboxError = "Le repo n'est pas clean — commite ou stashe tes modifications avant de tester un patch.";
            } else if (!res.ok) {
                sandboxError = data.message ?? "Erreur apply";
            } else {
                sandboxState = { applied: data.applied, deps: sandboxState?.deps ?? {} };
            }
        } catch (e: any) { sandboxError = e.message; }
        finally { sandboxBusy = null; }
    }

    async function sandboxUnapply(task: Task, patchName: string) {
        if (sandboxBusy) return;
        sandboxBusy = patchName; sandboxError = "";
        try {
            const res = await fetch(`/api/tasks/${task.id}/patches/${encodeURIComponent(patchName)}/sandbox`, { method: "DELETE" });
            const data = await res.json();
            if (data.error === "dirty") {
                sandboxError = "Le repo n'est pas clean — commite ou stashe tes modifications avant de retirer un patch.";
            } else if (!res.ok) {
                sandboxError = data.message ?? "Erreur unapply";
            } else {
                sandboxState = { applied: data.applied, deps: sandboxState?.deps ?? {} };
            }
        } catch (e: any) { sandboxError = e.message; }
        finally { sandboxBusy = null; }
    }

    // ── Polling patches pendant un run fullplan ───────────────────────────────
    let _patchPoll: ReturnType<typeof setInterval> | null = null;

    function _startPatchPoll(taskId: string) {
        if (_patchPoll) return; // déjà actif
        _patchPoll = setInterval(() => loadPatches(taskId), 2500);
    }
    function _stopPatchPoll() {
        if (_patchPoll) { clearInterval(_patchPoll); _patchPoll = null; }
    }

    // Démarre le polling quand un fullplan est sélectionné ET que l'agent tourne
    $: if (selected?.type === "fullplan" && $agentRunState.running) {
        _startPatchPoll(selected.id);
    } else {
        _stopPatchPoll();
    }

    onDestroy(_stopPatchPoll);

    async function openPatch(task: Task, patch: PatchInfo) {
        selectedPatch = patch;
        patchContent = null;
        patchLoading = true;
        selectedPanel = "patch";
        try {
            const res = await fetch(`/api/tasks/${task.id}/patches/${encodeURIComponent(patch.name)}`);
            if (res.ok) patchContent = await res.text();
        } finally { patchLoading = false; }
    }

    async function applySelectedPatch(task: Task) {
        if (!selectedPatch || patchApplying) return;
        patchApplying = true; wfError = "";
        try {
            const res = await fetch(`/api/tasks/${task.id}/patches/${encodeURIComponent(selectedPatch.name)}/apply`, { method: "POST" });
            if (!res.ok) { const d = await res.json(); wfError = d.message ?? "Erreur apply"; }
        } catch (e: any) { wfError = e.message; }
        finally { patchApplying = false; }
    }

    async function writeTests(task: Task, row: IssueRow) {
        if (!task.fullPlanId || !row.patch) return;
        agentRunState.update(s => ({
            ...s,
            taskId: task.id,
            taskTitle: `Tests — #${row.number} ${row.title}`,
            logs: [],
            running: true,
            sessionAlive: false,
        }));
        try {
            const res = await fetch(`/api/issues/groups/full-plans/${task.fullPlanId}/write-tests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ issueNumber: row.number, patchName: row.patch.name }),
            });
            await startConsoleStream(res, { onDone: async () => { await loadPatches(task.id); await loadTasksSilent(); } });
        } catch (e: any) {
            agentRunState.update(s => ({
                ...s,
                running: false,
                logs: [...s.logs, { line: `[erreur] ${e.message}`, type: "system" }],
            }));
        }
    }

    async function runTests(task: Task, row: IssueRow) {
        if (!task.fullPlanId || !row.patch) return;
        testRunState.set({ planId: task.fullPlanId, issueNumber: row.number, logs: [], running: true, exitCode: null });
        consoleTab.set("tests");
        try { sessionStorage.setItem("lastConsoleTab", "tests"); } catch { /* SSR */ }
        try {
            const res = await fetch(`/api/issues/groups/full-plans/${task.fullPlanId}/run-tests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ issueNumber: row.number, patchName: row.patch.name }),
            });
            if (!res.ok || !res.body) {
                const msg = await res.text().catch(() => `HTTP ${res.status}`);
                testRunState.update(s => ({ ...s, running: false, exitCode: 1, logs: [...s.logs, { line: msg, type: "sys" as const }] }));
                return;
            }
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                for (const raw of dec.decode(value).split("\n")) {
                    if (!raw.startsWith("data: ")) continue;
                    try {
                        const ev = JSON.parse(raw.slice(6));
                        if (ev.type === "exit") {
                            testRunState.update(s => {
                                const next = { ...s, running: false, exitCode: ev.code };
                                try { sessionStorage.setItem("lastTestRun", JSON.stringify(next)); } catch { /* SSR */ }
                                return next;
                            });
                        } else {
                            testRunState.update(s => ({ ...s, logs: [...s.logs, { line: ev.line, type: ev.type as TestLog["type"] }] }));
                        }
                    } catch { /* ligne malformée */ }
                }
            }
        } catch (e: any) {
            testRunState.update(s => {
                const next = { ...s, running: false, exitCode: 1, logs: [...s.logs, { line: `[erreur] ${e.message}`, type: "sys" as const }] };
                try { sessionStorage.setItem("lastTestRun", JSON.stringify(next)); } catch { /* SSR */ }
                return next;
            });
        }
    }

    async function rejectPatch(task: Task, patch: PatchInfo) {
        await fetch(`/api/tasks/${task.id}/patches/${encodeURIComponent(patch.name)}`, { method: "DELETE" });
        if (selectedPatch?.name === patch.name) { selectedPatch = null; patchContent = null; selectedPanel = "plan"; }
        await loadPatches(task.id);
        await loadTasksSilent();
    }

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

    // Spinner braille
    const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frame = 0;
    let spinnerInterval: ReturnType<typeof setInterval> | null = null;
    onMount(() => { spinnerInterval = setInterval(() => { frame = (frame + 1) % FRAMES.length; }, 80); });
    onDestroy(() => { if (spinnerInterval) clearInterval(spinnerInterval); });

    // Push / merge
    let pushing = false;
    let merging = false;

    // ATLAS
    let atlasGenerating = false;
    let atlasFeedback   = "";

    async function toggleAtlas(task: Task, enabled: boolean) {
        await fetch(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ atlasEnabled: enabled }),
        });
        await loadTasks();
        atlasFeedback = "";
        // Auto-générer l'atlas dès l'activation
        if (enabled) generateAtlas(task);
    }

    async function generateAtlas(task: Task) {
        if (atlasGenerating) return;
        atlasGenerating = true;
        atlasFeedback   = "";
        try {
            const res  = await fetch("/api/atlas/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId: task.id }),
            });
            const data = await res.json();
            atlasFeedback = data.error ? data.error : `✓ ${data.entryPoints} points d'entrée`;
        } catch (e: any) {
            atlasFeedback = e.message ?? "Erreur";
        } finally {
            atlasGenerating = false;
        }
    }

    // Sauter la planification
    let skippingPlan = false;
    async function skipPlan(task: Task) {
        if (skippingPlan) return;
        skippingPlan = true; wfError = "";
        try {
            const res = await fetch(`/api/tasks/${task.id}/plan`, { method: "POST" });
            const data = await res.json();
            if (data.error) { wfError = data.error; return; }
            await loadTasks();
            await loadPlan(task.id);
            selectedPanel = "implement";
        } catch (e: any) {
            wfError = e.message;
        } finally { skippingPlan = false; }
    }

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
            const planStr = task.planUsage ? `p:${Math.round(task.planUsage.inputTokens / 100) / 10}k` : "";
            const implTokens = task.implUsage;
            const implStr = implTokens ? `${Math.round(implTokens.inputTokens / 100) / 10}k` : "";
            const sigma = (task.planUsage && task.implUsage)
                ? ` Σ${Math.round((task.planUsage.inputTokens + task.implUsage.inputTokens) / 100) / 10}k`
                : "";
            const label = [planStr, implStr].filter(Boolean).join(" · ");
            return [{ name: (label || "impl.") + sigma, color: "9181f9" }];
        }
        return [];
    }


    $: statusFiltered = (() => {
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
            : tasks.filter(t => taskToFilter(t) === filter);
        return base.slice().sort((a, b) => pos(a.issueNumber) - pos(b.issueNumber));
    })();
    $: fuse = new Fuse(statusFiltered, { keys: ['title'], threshold: 0.4 });
    $: filtered = filterQuery.trim()
        ? fuse.search(filterQuery).map(r => r.item)
        : statusFiltered;
    $: countOf = (f: Filter) => tasks.filter(t => taskToFilter(t) === f).length;

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
        // Si une sélection est en attente (task créée depuis une issue),
        // onRefreshTick (déclenché par $taskRefreshTick) s'en charge — ne pas interférer.
        const hasPending = !!get(pendingSelectTaskId);
        await loadTasks();
        if (hasPending) {
            tasksReady.set(true);
            return;
        }
        const savedId = localStorage.getItem(SELECTED_KEY);
        const savedTask = savedId ? tasks.find(t => t.id === savedId) : null;
        const validSaved = savedTask && savedTask.status !== "merged" && savedTask.status !== "failed" ? savedTask : null;
        // Priorité : task "planification" > task sauvegardée active > première task avec plan
        const toSelect = tasks.find(t => t.status === "planification")
            ?? validSaved
            ?? tasks.find(t => t.hasPlan && t.status !== "merged" && t.status !== "failed");
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

    // ⚠ Ne PAS lire selected/planContent/planLoading ici directement :
    // Svelte 4 les inclut comme dépendances et boucle à l'infini.
    // On délègue à une fonction pour isoler le scope de tracking.
    $: if ($taskRefreshTick) onRefreshTick();


    function onRefreshTick() {
        (async () => {
            await loadTasksSilent();
            const pendingId = $pendingSelectTaskId;
            if (pendingId) {
                pendingSelectTaskId.set(null);
                const toSelect = tasks.find(t => t.id === pendingId);
                if (toSelect) { await selectTask(toSelect); return; }
            }
            // Recharger le plan si le fichier existe mais que le contenu est absent de l'UI
        const terminalStatus = selected?.status === "merged" || selected?.status === "failed";
        if (selected?.hasPlan && !planContent && !planLoading && !terminalStatus) {
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
            taskIssueNumbers.set(new Set(tasks.filter(t => t.issueNumber).map(t => t.issueNumber!)));
            if (selected) {
                const prev = selected.status;
                selected = tasks.find(t => t.id === selected!.id) ?? null;
                if (selected && selected.status !== prev) {
                    const f = taskToFilter(selected);
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
            taskIssueNumbers.set(new Set(tasks.filter(t => t.issueNumber).map(t => t.issueNumber!)));
            if (selected) {
                const prev = selected.status;
                selected = tasks.find(t => t.id === selected!.id) ?? null;
                if (selected && selected.status !== prev) {
                    const f = taskToFilter(selected);
                    if (f) filter = f;
                }
            }
        } catch { /* silencieux */ }
    }

    async function remove(task: Task) {
        if (task.type === "fullplan" && task.fullPlanId) {
            await fetch(`/api/issues/groups/full-plans/${task.fullPlanId}`, { method: "DELETE" });
            if (selected?.id === task.id) activeFullPlan.set(null);
        }
        await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
        if (selected?.id === task.id) {
            selected = null; planContent = null; diffContent = null;
            patches = []; selectedPatch = null; patchContent = null; fullPlanDetail = null;
        }
        await loadTasks();
    }

    async function loadPlan(taskId: string) {
        planLoading = true;
        planContent = null;
        try {
            const res = await fetch(`/api/tasks/${taskId}/plan`);
            const data = await res.json();
            planContent = data.content ?? null;
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

    // silent=true : auto-restore au démarrage — ne bascule pas le centre vers "plan"
    async function selectTask(initialTask: Task, silent = false) {
        if (selected?.id === initialTask.id) {
            selected = null; planContent = null; diffContent = null;
            patches = []; selectedPatch = null; patchContent = null; fullPlanDetail = null;
            commitMsg = ""; selectedPanel = "plan"; wfError = "";
            if (initialTask.type === "fullplan") {
                activeFullPlan.set(null);
            } else {
                planModeTask.set(null);
            }
            localStorage.removeItem(SELECTED_KEY);
            return;
        }
        localStorage.setItem(SELECTED_KEY, initialTask.id);
        selected = initialTask;
        planContent = null; diffContent = null;
        patches = []; selectedPatch = null; patchContent = null; fullPlanDetail = null;
        commitMsg = ""; wfError = ""; revertConfirm = false;
        sandboxState = null; sandboxError = "";
        selectedPanel = "plan";
        if (initialTask.hasPatch || initialTask.type === "fullplan") {
            loadPatches(initialTask.id);
            loadSandboxState(initialTask.id);
        }
        linkedIssueState = null;
        const taskFilter = taskToFilter(initialTask);
        if (taskFilter) filter = taskFilter;

        // Task de type fullplan → ouvrir le panel plan complet + charger détail issues
        if (initialTask.type === "fullplan" && initialTask.fullPlanId) {
            const res = await fetch(`/api/issues/groups/full-plans/${initialTask.fullPlanId}`);
            if (res.ok) {
                const fp = await res.json();
                fullPlanDetail = fp;
                activeFullPlan.set({ id: fp.id, keyword: fp.keyword, status: fp.status, planFile: fp.planFile, taskId: initialTask.id });
            }
            // Charger le diff si une branche existe (sans setter planModeTask)
            if (initialTask.branch) {
                await loadDiff(initialTask.id);
                if (diffContent?.trim()) selectedPanel = "commit";
                else if (diffContent !== null) selectedPanel = "push";
            }
            return;
        }

        // Toujours activer la scène plan pour une task active (même au démarrage)
        if (initialTask.status !== "merged" && initialTask.status !== "failed") {
            planModeTask.set({ id: initialTask.id, title: initialTask.title, issueNumber: initialTask.issueNumber });
            if (!silent) consoleTab.set("symbols");
        }

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
                    const f = taskToFilter(data);
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
            commitMsg = "";
            planModeTask.set(null);
            localStorage.removeItem(SELECTED_KEY);
            if (task.issueNumber) issueListRefreshTick.update(n => n + 1);
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

    <div class="search-bar">
        <input
            class="search-input"
            placeholder="Filtrer…"
            bind:value={filterQuery}
        />
        {#if filterQuery}
            <button class="search-clear" onclick={() => filterQuery = ''}>✕</button>
        {/if}
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
                    class:task-closed={task.status === "failed" || task.status === "merged"}
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
                    <div class="inline-detail">

                        {#if task.status === "merged"}
                            <!-- ── Task mergée ── -->
                            <div class="merged-panel">
                                <span class="merged-badge">✓ Mergée</span>
                                {#if task.branch}
                                    <span class="merged-branch">{task.branch}</span>
                                {/if}
                                {#if task.issueNumber}
                                    <span class="merged-issue">#{task.issueNumber}</span>
                                {/if}
                                <button class="merged-delete" onclick={() => remove(task)} title="Supprimer cette task">✕ Supprimer</button>
                            </div>

                        {:else}

                        <!-- ── État des issues (fullplan) ── -->
                        {#if task.type === "fullplan" && issueRows.length > 0}
                            <div class="issue-status-table">
                                {#if sandboxError}
                                    <div class="sandbox-error">
                                        <span>⚠ {sandboxError}</span>
                                        <button onclick={() => sandboxError = ""}>✕</button>
                                    </div>
                                {/if}
                                {#each issueRows as row}
                                    <div
                                        class="issue-status-row"
                                        class:clickable={!!row.patch}
                                        onclick={row.patch ? () => openPatch(task, row.patch!) : undefined}
                                        role={row.patch ? "button" : undefined}
                                        tabindex={row.patch ? 0 : undefined}
                                        onkeydown={row.patch ? (e) => e.key === 'Enter' && openPatch(task, row.patch!) : undefined}
                                    >
                                        <span class="is-dot is-{row.state}"></span>
                                        <span class="is-num">#{row.number}</span>
                                        <span class="is-title">{row.title}</span>
                                        <span class="is-stack">{row.stack}</span>
                                        {#if row.state === "no-patch"}
                                            <span class="is-badge is-missing">∅ patch</span>
                                            <span class="is-badge is-missing">? tests</span>
                                        {:else if row.state === "patch-no-tests"}
                                            <span class="is-badge is-ok">patch<button class="is-reject-btn" onclick={(e) => { e.stopPropagation(); rejectPatch(task, row.patch!); }} title="Rejeter ce patch">✕</button></span>
                                            <button class="is-badge is-notests is-btn" onclick={(e) => { e.stopPropagation(); writeTests(task, row); }} title="Écrire les tests manquants">∅ tests ▶</button>
                                        {:else}
                                            <span class="is-badge is-ok">patch<button class="is-reject-btn" onclick={(e) => { e.stopPropagation(); rejectPatch(task, row.patch!); }} title="Rejeter ce patch">✕</button></span>
                                            <button class="is-badge is-ok is-btn" onclick={(e) => { e.stopPropagation(); runTests(task, row); }} title="Lancer les tests">
                                                {$testRunState.planId === task.fullPlanId && $testRunState.issueNumber === row.number && $testRunState.running ? "…" : "▶"} tests
                                            </button>
                                        {/if}
                                        {#if row.patch}
                                            {#if sandboxState?.applied.includes(row.patch.name)}
                                                <button
                                                    class="is-sandbox-btn is-sandbox-applied"
                                                    onclick={(e) => { e.stopPropagation(); sandboxUnapply(task, row.patch!.name); }}
                                                    disabled={!!sandboxBusy}
                                                    title="Retirer ce patch du repo"
                                                >{sandboxBusy === row.patch.name ? "…" : "↩"}</button>
                                            {:else}
                                                <button
                                                    class="is-sandbox-btn"
                                                    onclick={(e) => { e.stopPropagation(); sandboxApply(task, row.patch!.name); }}
                                                    disabled={!!sandboxBusy}
                                                    title={sandboxState?.deps[row.patch.name]?.length ? `Applique aussi : ${sandboxState.deps[row.patch.name].join(', ')}` : "Appliquer ce patch dans le repo"}
                                                >{sandboxBusy === row.patch.name ? "…" : "↓ tester"}</button>
                                            {/if}
                                        {/if}
                                    </div>
                                {/each}
                                <div class="issue-status-footer">
                                    <button
                                        class="wf-btn"
                                        onclick={() => closeFullPlanIssues(task)}
                                        disabled={closingIssues}
                                    >{closingIssues ? "…" : `✕ Fermer les ${issueRows.length} issues`}</button>
                                </div>
                            </div>
                        {/if}

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
                                class:wf-disabled={btnVariant(0) !== "active"}
                                disabled={btnVariant(0) !== "active"}
                                onclick={() => selectedPanel = "plan"}
                            >Planifier</button>

                            <span class="wf-arrow">›</span>

                            <button
                                class="wf-btn"
                                class:wf-active={btnVariant(1) === "active"}
                                class:wf-disabled={btnVariant(1) !== "active"}
                                disabled={btnVariant(1) !== "active"}
                                onclick={() => selectedPanel = "implement"}
                            >Implémenter</button>

                            <span class="wf-arrow">›</span>

                            <button
                                class="wf-btn"
                                class:wf-active={btnVariant(2) === "active"}
                                class:wf-disabled={btnVariant(2) !== "active"}
                                disabled={btnVariant(2) !== "active" || branchCreating}
                                onclick={() => task.branch ? (selectedPanel = "commit") : createBranchAndShowDiff(task)}
                            >{branchCreating ? "Création…" : "Commiter"}</button>

                            <span class="wf-arrow">›</span>

                            <button
                                class="wf-btn"
                                class:wf-active={btnVariant(3) === "active"}
                                class:wf-disabled={btnVariant(3) !== "active"}
                                disabled={btnVariant(3) !== "active"}
                                onclick={() => selectedPanel = "push"}
                            >Push</button>

                            <span class="wf-arrow">›</span>

                            <button class="wf-btn wf-disabled" disabled>Merge</button>

                        </div>

                        {#if wfError}
                            <div class="wf-error">{wfError}</div>
                        {/if}

                        <!-- ── Toggle ATLAS ── -->
                        <div class="atlas-row">
                            <label class="atlas-toggle">
                                <input
                                    type="checkbox"
                                    checked={task.atlasEnabled ?? false}
                                    onchange={(e) => toggleAtlas(task, (e.target as HTMLInputElement).checked)}
                                />
                                ATLAS
                            </label>
                            {#if atlasFeedback}
                                <span class="atlas-feedback">{atlasFeedback}</span>
                            {/if}
                        </div>

                        <!-- ── Contenu ── -->
                        {#if selectedPanel === "plan"}
                            <div class="plan-scene-hint">↗ Scène principale</div>
                            {#if !planContent}
                                <button
                                    class="impl-skip"
                                    onclick={() => skipPlan(task)}
                                    disabled={skippingPlan}
                                >{skippingPlan ? "…" : "→ Sauter la planification"}</button>
                            {/if}
                            {#if task.planUsage}
                                <PromptUsage usage={task.planUsage} totalUsage={task.totalUsage} label="Plan" />
                            {/if}

                        {:else if selectedPanel === "implement"}
                            <div class="impl-actions">
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
                                        class:merging-spin={merging}
                                        onclick={() => mergeBranch(task)}
                                        disabled={!task.pushed || merging}
                                    >{merging ? FRAMES[frame] : "⇒ Merge → main"}</button>
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

                        {/if}<!-- /merged else -->

                        {#if selectedPanel === "patch" && selectedPatch}
                            <div class="patch-panel">
                                <div class="patch-panel-bar">
                                    <span class="patch-panel-title">{selectedPatch.issueNumber ? `#${selectedPatch.issueNumber}` : selectedPatch.name}</span>
                                    <span class="patch-panel-test" class:has-tests={selectedPatch.hasTests}>{selectedPatch.hasTests ? "✓ tests" : "✗ tests"}</span>
                                    <button class="wf-btn wf-active" onclick={() => applySelectedPatch(task)} disabled={patchApplying}>{patchApplying ? "…" : "↓ Appliquer"}</button>
                                    <button class="wf-btn" onclick={() => rejectPatch(task, selectedPatch!)}>✕ Rejeter</button>
                                </div>
                                {#if patchLoading}
                                    <span class="diff-hint">Chargement…</span>
                                {:else if patchContent}
                                    <div class="diff-view">
                                        {#each patchContent.split('\n') as line}
                                            <div class="diff-line"
                                                class:add={line.startsWith('+') && !line.startsWith('+++')}
                                                class:del={line.startsWith('-') && !line.startsWith('---')}
                                                class:hunk={line.startsWith('@@')}
                                                class:meta={line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')}
                                            >{line || '\u200b'}</div>
                                        {/each}
                                    </div>
                                {/if}
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
.list { flex: 1; min-height: 0; overflow-y: auto; }
.list::-webkit-scrollbar { width: 4px; }
.list::-webkit-scrollbar-track { background: transparent; }
.list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.task-row-wrap { position: relative; }
.task-closed :global(.item-row) { opacity: 0.55; }
.task-closed :global(.item-title) { text-decoration: line-through; }
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
.merging-spin { color: cornsilk !important; }

/* ── Task mergée ── */
.merged-panel {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid #0a160c;
    background: #05100a;
}
.merged-badge {
    font-size: 0.58rem;
    font-family: 'JetBrains Mono', monospace;
    color: #4caf50;
    flex-shrink: 0;
}
.merged-branch {
    font-size: 0.55rem;
    font-family: 'JetBrains Mono', monospace;
    color: #2a5a3a;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.merged-issue {
    font-size: 0.55rem;
    font-family: 'JetBrains Mono', monospace;
    color: #2a4a2a;
    flex-shrink: 0;
}
.merged-delete {
    background: none;
    border: 1px solid #1a2a1a;
    color: #2a4a2a;
    font-size: 0.55rem;
    font-family: 'JetBrains Mono', monospace;
    padding: 0.15rem 0.45rem;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.1s, border-color 0.1s;
}
.merged-delete:hover { color: #f44336; border-color: #f44336; }

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
    color: #333;
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
.impl-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
}
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
.impl-skip:disabled { opacity: 0.35; cursor: default; }

/* ── ATLAS toggle ── */
.atlas-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 1rem;
    border-top: 1px solid var(--border);
    flex-wrap: wrap;
}
.atlas-toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    color: #aaa;
    cursor: pointer;
    user-select: none;
}
.atlas-toggle input { cursor: pointer; accent-color: #9181f9; }
.atlas-feedback { font-size: 0.68rem; color: #888; }

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

/* ── Issue status table (fullplan) ── */
.issue-status-table {
    display: flex; flex-direction: column;
    border-bottom: 1px solid var(--border);
    padding: 4px 0;
}
.issue-status-row {
    display: flex; align-items: center; gap: 6px;
    padding: 3px 8px; font-size: 0.65rem;
}
.issue-status-row.clickable { cursor: pointer; }
.issue-status-row.clickable:hover { background: var(--bg-hover, #1a1a1a); }
.is-dot {
    width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
.is-dot.is-patch-tests    { background: #4caf50; }
.is-dot.is-patch-no-tests { background: #f7c948; }
.is-dot.is-no-patch       { background: #555; }
.is-num  { color: #888; flex-shrink: 0; }
.is-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
.is-stack { color: #555; font-size: 0.6rem; flex-shrink: 0; }
.is-badge { font-size: 0.58rem; flex-shrink: 0; padding: 1px 4px; border-radius: 3px; }
.is-badge.is-missing  { background: #2a2a2a; color: #555; }
.is-badge.is-notests  { background: rgba(247,201,72,0.15); color: #f7c948; }
.is-badge.is-ok       { background: rgba(76,175,80,0.15); color: #4caf50; }
.is-badge.is-btn      { border: none; cursor: pointer; }
.is-badge.is-btn:hover { filter: brightness(1.4); }
.is-reject-btn {
    background: none; border: none; cursor: pointer;
    color: inherit; font-size: 0.55rem; padding: 0 0 0 3px; line-height: 1; opacity: 0;
}
.is-badge:hover .is-reject-btn { opacity: 0.7; }
.is-reject-btn:hover { opacity: 1 !important; }
.is-sandbox-btn {
    background: none; border: 1px solid #333; border-radius: 3px; cursor: pointer;
    color: #888; font-size: 0.55rem; padding: 1px 4px; flex-shrink: 0;
    opacity: 0; transition: opacity 0.1s;
}
.issue-status-row:hover .is-sandbox-btn { opacity: 1; }
.is-sandbox-btn:hover { color: #aef; border-color: #aef; }
.is-sandbox-btn.is-sandbox-applied { color: #f7c948; border-color: #f7c948; opacity: 1; }
.is-sandbox-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sandbox-error {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px; font-size: 0.62rem; color: #f7c948;
    background: rgba(247,201,72,0.08); border-bottom: 1px solid rgba(247,201,72,0.2);
}
.sandbox-error span { flex: 1; }
.sandbox-error button {
    background: none; border: none; cursor: pointer; color: #f7c948; font-size: 0.7rem; padding: 0 2px;
}
.issue-status-footer  { padding: 4px 8px; }


/* ── Patches ── */
.patch-sublist {
    display: flex;
    flex-direction: column;
    padding: 2px 0 2px 8px;
    border-left: 2px solid var(--border);
    margin: 0 4px 4px 8px;
    gap: 1px;
}
.patch-sub-item {
    display: flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 3px 6px;
    border-radius: 3px;
    font-size: 0.67rem;
    color: var(--text-muted);
    width: 100%;
    text-align: left;
    position: relative;
}
.patch-sub-item:hover, .patch-sub-item.patch-selected { background: var(--bg-hover, #1a1a1a); color: var(--text); }
.patch-dot {
    width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
    background: #f44336;
}
.patch-dot.has-tests { background: #4caf50; }
.patch-sub-label { flex: 1; }
.patch-reject-btn {
    opacity: 0; background: none; border: none; cursor: pointer;
    color: #555; font-size: 0.6rem; padding: 0 2px; line-height: 1;
}
.patch-sub-item:hover .patch-reject-btn { opacity: 1; }
.patch-panel { display: flex; flex-direction: column; border-top: 1px solid var(--border); }
.patch-panel-bar {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 8px; flex-shrink: 0;
}
.patch-panel-title { font-size: 0.7rem; font-weight: 600; color: var(--text); }
.patch-panel-test { font-size: 0.62rem; color: #f44336; }
.patch-panel-test.has-tests { color: #4caf50; }
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
