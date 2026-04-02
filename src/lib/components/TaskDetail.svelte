<script lang="ts">
import { onMount, onDestroy } from "svelte";
import { agentState, agentRunState, hoveredIssueNumber, activeFullPlan, startConsoleStream, testRunState, planModeTask, issueListRefreshTick, taskRefreshTick, consoleTab, type TestLog } from "$lib/stores/agent";
import { getInitialConsoleTab, formatDiffSummary } from "./TaskList.helpers";
import { taskStore } from "$lib/domain/TaskStore.svelte.ts";
import PromptUsage from "$lib/components/PromptUsage.svelte";
import type { Task, WfPanel, PatchInfo, IssueRow, IssueRef, IssueState, FullPlanDetail, SandboxState, CommitAllProgress } from "$lib/types/task";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface Props {
    task: Task;
    onloadtasks: () => Promise<void>;
    onloadtaskssilent: () => Promise<void>;
    onselecttask: (task: Task, silent?: boolean) => Promise<void>;
    onclearselected: () => void;
    onremove: (task: Task) => Promise<void>;
}
let { task, onloadtasks, onloadtaskssilent, onselecttask, onclearselected, onremove }: Props = $props();

// ── État local ─────────────────────────────────────────────────────────────────
let selectedPanel = $state<WfPanel>("plan");
let wfError = $state("");

// Plan
let planContent = $state<string | null>(null);
let planLoading = $state(false);

// Fullplan detail + issue status
let fullPlanDetail = $state<FullPlanDetail | null>(null);
let closingIssues = $state(false);

let issueRows = $derived((() => {
    if (!fullPlanDetail) return [] as IssueRow[];
    const rows: IssueRow[] = [];
    const findPatch = (num: number) =>
        patches.find(p => p.issueNumbers?.includes(num) ?? p.issueNumber === num);
    if (fullPlanDetail.stepFiles?.length) {
        const titleMap = new Map<number, string>();
        for (const s of fullPlanDetail.subStacks)
            for (const i of s.issues) titleMap.set(i.number, i.title);
        for (const i of (fullPlanDetail.residualIssues ?? []))
            titleMap.set(i.number, i.title);
        for (const sf of fullPlanDetail.stepFiles) {
            const stepLabel = sf.filename.replace(".md", "");
            for (const num of sf.issues) {
                const patch = findPatch(num);
                const state: IssueState = patch ? (patch.hasTests ? "patch-tests" : "patch-no-tests") : "no-patch";
                rows.push({ number: num, title: titleMap.get(num) ?? `#${num}`, stack: stepLabel, state, patch });
            }
        }
    } else {
        for (const stack of fullPlanDetail.subStacks) {
            for (const issue of stack.issues) {
                const patch = findPatch(issue.number);
                const state: IssueState = patch ? (patch.hasTests ? "patch-tests" : "patch-no-tests") : "no-patch";
                rows.push({ ...issue, stack: stack.keyword, state, patch });
            }
        }
        for (const issue of (fullPlanDetail.residualIssues ?? [])) {
            const patch = findPatch(issue.number);
            const state: IssueState = patch ? (patch.hasTests ? "patch-tests" : "patch-no-tests") : "no-patch";
            rows.push({ ...issue, stack: "résiduel", state, patch });
        }
    }
    return rows;
})());

let staleRows = $derived(issueRows.filter(r => r.patch?.stale));

// Patches
let patches = $state<PatchInfo[]>([]);
let selectedPatch = $state<PatchInfo | null>(null);
let patchContent = $state<string | null>(null);
let patchLoading = $state(false);
let patchApplying = $state(false);

// Commit-all patches
let commitAllBusy = $state(false);
let commitAllProgress = $state<CommitAllProgress | null>(null);

// Sandbox
let sandboxState = $state<SandboxState | null>(null);
let sandboxError = $state("");
let sandboxBusy = $state<string | null>(null);
let repromptBusy = $state<number | null>(null);

// Issue sélectionnée dans l'arbre fullplan
let selectedIssueRow = $state<IssueRow | null>(null);
let selectedIssueDetail = $state<{ title: string; body: string } | null>(null);
let loadingIssueDetail = $state(false);

// Post-run actions (#132)
let justFinished = $state(false);
let _prevSelectedStatus = $state<string | null>(null);
$effect(() => {
    const currentStatus = task?.status ?? null;
    const wasDone = _prevSelectedStatus !== null && (
        _prevSelectedStatus === 'implementation' ||
        _prevSelectedStatus === 'documentation' ||
        _prevSelectedStatus === 'validation'
    );
    const isNowDone = currentStatus === 'implementation' ||
        currentStatus === 'documentation' ||
        currentStatus === 'validation';
    if (!wasDone && isNowDone && _prevSelectedStatus !== null) {
        justFinished = true;
        onloadtaskssilent();
        setTimeout(() => { justFinished = false; }, 3000);
    }
    _prevSelectedStatus = currentStatus;
});

// DAG de dépendances (#246)
let taskDag = $state<{ steps: { id: number }[] } | null>(null);

// Marquer implémentée (#18)
let markingImplemented = $state(false);

// Diff / commit
let diffContent = $state<string | null>(null);
let diffLoading = $state(false);
let commitMsg = $state("");
let committing = $state(false);
let reverting = $state(false);
let revertConfirm = $state(false);
let branchCreating = $state(false);

// Push / merge
let pushing = $state(false);
let commitsAhead = $state<{ count: number; commits: { sha: string; message: string }[] } | null>(null);
let merging = $state(false);

// Sauter la planification
let skippingPlan = $state(false);

// Reset task bloquée
let resetting = $state(false);

// Issue liée
let linkedIssueState = $state<"open" | "closed" | null>(null);
let closingIssue = $state(false);

// Input central
let centralInput = $state("");
let sendingCentralInput = $state(false);

// Spinner braille
let frame = $state(0);
let spinnerInterval: ReturnType<typeof setInterval> | null = null;
onMount(() => { spinnerInterval = setInterval(() => { frame = (frame + 1) % FRAMES.length; }, 80); });
onDestroy(() => { if (spinnerInterval) clearInterval(spinnerInterval); });

// ── Polling patches pendant un run fullplan ────────────────────────────────────
let _patchPoll: ReturnType<typeof setInterval> | null = null;
function _startPatchPoll(taskId: string) {
    if (_patchPoll) return;
    _patchPoll = setInterval(() => loadPatches(taskId), 2500);
}
function _stopPatchPoll() {
    if (_patchPoll) { clearInterval(_patchPoll); _patchPoll = null; }
}
$effect(() => {
    if (!$agentRunState.running || !$agentRunState.taskId) {
        _stopPatchPoll();
        return;
    }
    const runningTask = taskStore.tasks.find(t => t.fullPlanId === $agentRunState.taskId);
    if (!runningTask || runningTask.id !== task.id) { _stopPatchPoll(); return; }
    _startPatchPoll(runningTask.id);
});
onDestroy(_stopPatchPoll);

// ── Initialisation quand la task sélectionnée change ──────────────────────────
let _prevTaskId: string | null = null;
$effect(() => {
    const id = task.id;
    if (id === _prevTaskId) return;
    _prevTaskId = id;
    resetState();
    initTask(task);
});

function resetState() {
    selectedPanel = "plan";
    wfError = "";
    planContent = null;
    planLoading = false;
    fullPlanDetail = null;
    closingIssues = false;
    patches = [];
    selectedPatch = null;
    patchContent = null;
    patchLoading = false;
    patchApplying = false;
    commitAllBusy = false;
    commitAllProgress = null;
    sandboxState = null;
    sandboxError = "";
    sandboxBusy = null;
    repromptBusy = null;
    selectedIssueRow = null;
    selectedIssueDetail = null;
    loadingIssueDetail = false;
    taskDag = null;
    diffContent = null;
    diffLoading = false;
    commitMsg = "";
    committing = false;
    reverting = false;
    revertConfirm = false;
    branchCreating = false;
    pushing = false;
    commitsAhead = null;
    merging = false;
    skippingPlan = false;
    resetting = false;
    linkedIssueState = null;
    closingIssue = false;
    centralInput = "";
    sendingCentralInput = false;
    _prevSelectedStatus = null;
}

async function initTask(t: Task) {
    if (t.hasPatch || t.type === "fullplan") {
        loadPatches(t.id);
        loadSandboxState(t.id);
    }
    linkedIssueState = null;

    if (t.type === "fullplan" && t.fullPlanId) {
        const res = await fetch(`/api/issues/groups/full-plans/${t.fullPlanId}`);
        if (res.ok) {
            const fp = await res.json();
            fullPlanDetail = fp;
            activeFullPlan.set({ id: fp.id, keyword: fp.keyword, status: fp.status, planFile: fp.planFile, taskId: t.id });
            if (fp.keyword && fp.id) {
                fetch(`/api/issues/groups/eval-dag/${fp.keyword}?planId=${fp.id}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(data => { if (data?.exists && data.levels?.length) taskDag = { steps: data.levels.flatMap((l: any) => l.issues.map((n: number) => ({ id: n }))) }; })
                    .catch(() => {});
            }
        } else {
            activeFullPlan.set({ id: t.fullPlanId, keyword: "", status: "error", taskId: t.id });
        }
        if (t.branch) {
            await loadDiff(t.id);
            if (diffContent?.trim()) selectedPanel = "commit";
            else {
                selectedPanel = "push";
                loadCommitsAhead(t.id);
            }
        } else if (t.status === "validation" || t.status === "merged") {
            selectedPanel = "push";
        }
        return;
    }

    if (t.issueNumber) loadLinkedIssueState(t.issueNumber);

    let synced = t;
    if (t.branch) {
        try {
            const syncRes = await fetch(`/api/tasks/${t.id}/sync`, { method: "POST" });
            const data = await syncRes.json();
            if (data && !data.error) {
                taskStore.tasks = taskStore.tasks.map(x => x.id === data.id ? data : x);
                synced = data;
            }
        } catch { /* silencieux */ }
    }

    const toLoad: Promise<void>[] = [loadPlan(synced.id)];
    if (synced.branch) toLoad.push(loadDiff(synced.id));
    await Promise.all(toLoad);

    if (synced.status === "documentation" || synced.status === "validation") {
        selectedPanel = diffContent?.trim() ? "commit" : "push";
        if (selectedPanel === "push") loadCommitsAhead(synced.id);
    } else if (synced.branch && diffContent !== null) {
        selectedPanel = diffContent.trim() ? "commit" : "push";
        if (selectedPanel === "push") loadCommitsAhead(synced.id);
    } else if (planContent) {
        selectedPanel = "implement";
    }

    if (synced.issueNumber) {
        agentState.update(s => ({ ...s, status: "loading", plan: null }));
        const res = await fetch(`/api/issue?number=${synced.issueNumber}`);
        const full = await res.json();
        agentState.update(s => ({
            ...s, issue: full, status: "idle", navigationStack: [],
            knownSubIssueNumbers: [...new Set([...s.knownSubIssueNumbers, ...(full.subIssues?.map((si: any) => si.number) ?? [])])]
        }));
    }
}

// ── Fonctions ──────────────────────────────────────────────────────────────────

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
    const t = taskStore.tasks.find(x => x.id === taskId) ?? task;
    if (t && !commitMsg) {
        commitMsg = `feat: ${t.issueNumber ? `#${t.issueNumber} ` : ""}${t.title.slice(0, 60)}`;
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

async function loadPatches(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}/patches`);
    if (res.ok) patches = await res.json();
    checkPatchStaleness(taskId);
}

async function checkPatchStaleness(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}/patches?check=1`);
    if (!res.ok) return;
    const checked: PatchInfo[] = await res.json();
    patches = patches.map(p => {
        const c = checked.find(c => c.name === p.name);
        return c ? { ...p, stale: c.stale } : p;
    });
}

async function loadSandboxState(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}/patches/sandbox`);
    if (res.ok) sandboxState = await res.json();
}

async function loadCommitsAhead(taskId: string) {
    commitsAhead = null;
    const res = await fetch(`/api/tasks/${taskId}/commits-ahead`);
    if (res.ok) commitsAhead = await res.json();
}

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

async function sendCentralInput(taskId: string) {
    const trimmed = centralInput.trim();
    if (!trimmed || sendingCentralInput) return;
    sendingCentralInput = true;
    try {
        await fetch("/api/agent/input", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: trimmed, taskId }),
        });
        centralInput = "";
    } catch { /* silencieux */ }
    finally { sendingCentralInput = false; }
}

async function closeFullPlanIssues(t: Task) {
    if (!t.fullPlanId || closingIssues) return;
    closingIssues = true; wfError = "";
    try {
        const res = await fetch(`/api/issues/groups/full-plans/${t.fullPlanId}/close-issues`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) wfError = data.message ?? "Erreur fermeture issues";
    } catch (e: any) { wfError = e.message; }
    finally { closingIssues = false; }
}

async function selectIssueRow(row: IssueRow) {
    selectedIssueRow = row;
    selectedIssueDetail = null;
    loadingIssueDetail = true;
    try {
        const res = await fetch(`/api/issue?number=${row.number}`);
        if (res.ok) {
            const data = await res.json();
            selectedIssueDetail = { title: data.title ?? row.title, body: data.body ?? "" };
        }
    } catch { /* ignore */ }
    finally { loadingIssueDetail = false; }
}

async function sandboxApply(t: Task, patchName: string) {
    if (sandboxBusy) return;
    sandboxBusy = patchName; sandboxError = "";
    try {
        const res = await fetch(`/api/tasks/${t.id}/patches/${encodeURIComponent(patchName)}/sandbox`, { method: "POST" });
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

async function sandboxUnapply(t: Task, patchName: string) {
    if (sandboxBusy) return;
    sandboxBusy = patchName; sandboxError = "";
    try {
        const res = await fetch(`/api/tasks/${t.id}/patches/${encodeURIComponent(patchName)}/sandbox`, { method: "DELETE" });
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

async function openPatch(t: Task, patch: PatchInfo) {
    selectedPatch = patch;
    patchContent = null;
    patchLoading = true;
    selectedPanel = "patch";
    try {
        const res = await fetch(`/api/tasks/${t.id}/patches/${encodeURIComponent(patch.name)}`);
        if (res.ok) patchContent = await res.text();
    } finally { patchLoading = false; }
}

async function applySelectedPatch(t: Task) {
    if (!selectedPatch || patchApplying) return;
    patchApplying = true; wfError = "";
    try {
        const res = await fetch(`/api/tasks/${t.id}/patches/${encodeURIComponent(selectedPatch.name)}/apply`, { method: "POST" });
        if (!res.ok) { const d = await res.json(); wfError = d.message ?? "Erreur apply"; }
    } catch (e: any) { wfError = e.message; }
    finally { patchApplying = false; }
}

async function rejectPatch(t: Task, patch: PatchInfo) {
    await fetch(`/api/tasks/${t.id}/patches/${encodeURIComponent(patch.name)}`, { method: "DELETE" });
    if (selectedPatch?.name === patch.name) { selectedPatch = null; patchContent = null; selectedPanel = "plan"; }
    await loadPatches(t.id);
    await onloadtaskssilent();
}

async function writeTests(t: Task, row: IssueRow) {
    if (!t.fullPlanId || !row.patch) return;
    agentRunState.update(s => ({
        ...s, taskId: t.id, taskTitle: `Tests — #${row.number} ${row.title}`, logs: [], running: true, sessionAlive: false,
    }));
    try {
        const res = await fetch(`/api/issues/groups/full-plans/${t.fullPlanId}/write-tests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ issueNumber: row.number, patchName: row.patch.name }),
        });
        await startConsoleStream(res, { onDone: async () => { await loadPatches(t.id); await onloadtaskssilent(); } });
    } catch (e: any) {
        agentRunState.update(s => ({ ...s, running: false, logs: [...s.logs, { line: `[erreur] ${e.message}`, type: "system" }] }));
    }
}

async function repromptIssue(t: Task, row: IssueRow) {
    if (!t.fullPlanId) return;
    const extraContext = window.prompt(`Contexte supplémentaire pour #${row.number} — ${row.title} :\n(laisser vide pour relancer tel quel)`) ?? "";
    repromptBusy = row.number;
    agentRunState.update(s => ({
        ...s, taskId: t.id, taskTitle: `Reprompt — #${row.number} ${row.title}`, logs: [], running: true, sessionAlive: false,
    }));
    try {
        const res = await fetch(`/api/issues/groups/full-plans/${t.fullPlanId}/reprompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ issueNumber: row.number, extraContext }),
        });
        await startConsoleStream(res);
        await loadPatches(t.id);
        await onloadtaskssilent();
        agentRunState.update(s => ({ ...s, running: true, logs: [...s.logs, { line: "[propagation] inspection des patches suivants...", type: "system" as const }] }));
        const propRes = await fetch(`/api/issues/groups/full-plans/${t.fullPlanId}/propagate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fromIssueNumber: row.number }),
        });
        await startConsoleStream(propRes, { onDone: async () => { await loadPatches(t.id); await onloadtaskssilent(); } });
    } catch (e: any) {
        agentRunState.update(s => ({ ...s, running: false, logs: [...s.logs, { line: `[erreur] ${e.message}`, type: "system" as const }] }));
    } finally {
        repromptBusy = null;
    }
}

async function repromptAllStale(t: Task) {
    if (!t.fullPlanId || !staleRows.length) return;
    const n = staleRows.length;
    agentRunState.update(s => ({
        ...s, taskId: t.id, taskTitle: `Régénération — ${n} patch${n > 1 ? "s" : ""} périmé${n > 1 ? "s" : ""}`, logs: [], running: true, sessionAlive: false,
    }));
    try {
        const res = await fetch(`/api/issues/groups/full-plans/${t.fullPlanId}/rerun-stale`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ staleIssueNumbers: staleRows.map(r => r.number) }),
        });
        await startConsoleStream(res, { onDone: async () => { await loadPatches(t.id); await onloadtaskssilent(); } });
    } catch (e: any) {
        agentRunState.update(s => ({ ...s, running: false, logs: [...s.logs, { line: `[erreur] ${e.message}`, type: "system" as const }] }));
    } finally {
        repromptBusy = null;
    }
}

async function runTests(t: Task, row: IssueRow) {
    if (!t.fullPlanId || !row.patch) return;
    testRunState.set({ planId: t.fullPlanId, issueNumber: row.number, logs: [], running: true, exitCode: null });
    consoleTab.set("tests");
    try { sessionStorage.setItem("lastConsoleTab", "tests"); } catch { /* SSR */ }
    try {
        const res = await fetch(`/api/issues/groups/full-plans/${t.fullPlanId}/run-tests`, {
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

async function commitAllPatches(t: Task) {
    if (commitAllBusy) return;
    commitAllBusy = true;
    commitAllProgress = { done: 0, total: patches.length, current: "" };
    try {
        const res = await fetch(`/api/tasks/${t.id}/commit-all-patches`, { method: "POST" });
        if (!res.ok || !res.body) {
            commitAllProgress = { ...commitAllProgress!, error: await res.text() };
            return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const events = buf.split("\n\n");
            buf = events.pop() ?? "";
            for (const ev of events) {
                const line = ev.replace(/^data: /, "").trim();
                if (!line) continue;
                try {
                    const obj = JSON.parse(line);
                    if (obj.type === "branch") commitAllProgress = { ...commitAllProgress!, branch: obj.name };
                    else if (obj.type === "applying") commitAllProgress = { ...commitAllProgress!, current: obj.patch, done: obj.index - 1, total: obj.total };
                    else if (obj.type === "applied") commitAllProgress = { ...commitAllProgress!, done: commitAllProgress!.done + 1 };
                    else if (obj.type === "done") {
                        commitAllProgress = { ...commitAllProgress!, done: obj.total, current: "", branch: obj.branch };
                        await onloadtaskssilent();
                        const updated = taskStore.tasks.find(x => x.id === t.id);
                        if (updated) await onselecttask(updated, true);
                    }
                    else if (obj.type === "error") commitAllProgress = { ...commitAllProgress!, error: obj.message ?? "Erreur inconnue" };
                } catch { /* JSON partiel */ }
            }
        }
    } finally {
        commitAllBusy = false;
    }
}

async function createBranchAndShowDiff(t: Task) {
    if (branchCreating) return;
    branchCreating = true; wfError = "";
    try {
        const res = await fetch(`/api/tasks/${t.id}/initial-commit`, { method: "POST" });
        const data = await res.json();
        if (data.error && res.status !== 409) { wfError = data.error; return; }
        await onloadtasks();
        await loadDiff(t.id);
        selectedPanel = "commit";
    } catch (e: any) {
        wfError = e.message;
    } finally { branchCreating = false; }
}

async function skipPlan(t: Task) {
    if (skippingPlan) return;
    skippingPlan = true; wfError = "";
    try {
        const res = await fetch(`/api/tasks/${t.id}/plan`, { method: "POST" });
        const data = await res.json();
        if (data.error) { wfError = data.error; return; }
        await onloadtasks();
        await loadPlan(t.id);
        selectedPanel = "implement";
    } catch (e: any) {
        wfError = e.message;
    } finally { skippingPlan = false; }
}

async function resetTask(t: Task) {
    if (resetting) return;
    resetting = true;
    try {
        const res = await fetch(`/api/tasks/${t.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "specification" })
        });
        const data = await res.json();
        if (!data.error) await onloadtasks();
    } finally { resetting = false; }
}

async function markTaskImplemented(t: Task) {
    if (markingImplemented) return;
    markingImplemented = true;
    try {
        const res = await fetch(`/api/tasks/${t.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "validation" }),
        });
        if (res.ok) {
            taskStore.tasks = taskStore.tasks.map(x => x.id === t.id ? { ...x, status: "validation" } : x);
        }
    } catch { /* silencieux */ }
    finally { markingImplemented = false; }
}

async function closeLinkedIssue(t: Task) {
    if (!t.issueNumber || closingIssue) return;
    closingIssue = true; wfError = "";
    try {
        const res = await fetch(`/api/issues/${t.issueNumber}/close`, { method: "POST" });
        const data = await res.json();
        if (data.error) { wfError = data.error; return; }
        linkedIssueState = "closed";
    } catch (e: any) {
        wfError = e.message;
    } finally { closingIssue = false; }
}

async function commitChanges(t: Task) {
    if (!commitMsg.trim() || committing) return;
    committing = true; wfError = "";
    try {
        const res = await fetch(`/api/tasks/${t.id}/commit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: commitMsg.trim() })
        });
        const data = await res.json();
        if (data.error) { wfError = data.error; return; }
        commitMsg = "";
        await Promise.all([loadDiff(t.id), onloadtaskssilent()]);
        selectedPanel = diffContent?.trim() ? "commit" : "push";
    } catch (e: any) {
        wfError = e.message;
    } finally { committing = false; }
}

async function revertChanges(t: Task) {
    if (!revertConfirm) { revertConfirm = true; return; }
    revertConfirm = false; reverting = true; wfError = "";
    try {
        const res = await fetch(`/api/tasks/${t.id}/revert`, { method: "POST" });
        const data = await res.json();
        if (data.error) { wfError = data.error; return; }
        await loadDiff(t.id);
        selectedPanel = "commit";
    } catch (e: any) {
        wfError = e.message;
    } finally { reverting = false; }
}

async function pushBranch(t: Task) {
    if (pushing) return;
    pushing = true; wfError = "";
    try {
        const res = await fetch(`/api/tasks/${t.id}/push`, { method: "POST" });
        const data = await res.json();
        if (data.error) { wfError = data.error; return; }
        taskStore.tasks = taskStore.tasks.map(x => x.id === data.id ? data : x);
    } catch (e: any) {
        wfError = e.message;
    } finally { pushing = false; }
}

async function mergeBranch(t: Task) {
    if (merging) return;
    merging = true; wfError = "";
    try {
        const res = await fetch(`/api/tasks/${t.id}/merge`, { method: "POST" });
        const data = await res.json();
        if (data.error) { wfError = data.error; return; }
        planModeTask.set(null);
        if (t.issueNumber) issueListRefreshTick.update(n => n + 1);
        taskRefreshTick.update(n => n + 1);
        onclearselected();
        await onloadtasks();
    } catch (e: any) {
        wfError = e.message;
    } finally { merging = false; }
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    return `${Math.round(ms / 1000)}k ms`;
}

// index de l'étape courante (0=plan, 1=impl, 2=commit, 3=push)
let currentStep = $derived((() => {
    if (!planContent) return 0;
    if (!task.branch) return 1;
    if (diffLoading || diffContent === null) {
        if (task.status === "documentation" || task.status === "validation") return 3;
        return 1;
    }
    if (diffContent.trim()) return 2;
    return 3;
})());

function btnVariant(idx: number): "active" | "secondary" | "disabled" {
    if (idx === currentStep) return "active";
    if (idx < currentStep) return "secondary";
    return "disabled";
}
</script>

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
            <button class="merged-delete" onclick={() => onremove(task)} title="Supprimer cette task">✕ Supprimer</button>
        </div>
    {:else}

    <!-- ── État des issues (fullplan) — arbre de dépendances ── -->
    {#snippet issueRow(t: Task, row: IssueRow)}
        <div
            class="issue-status-row clickable"
            class:is-selected={selectedIssueRow?.number === row.number}
            onclick={(e) => { if ((e.target as HTMLElement).closest('button, .is-badge')) return; selectIssueRow(row); }}
            role="button"
            tabindex={0}
            onkeydown={(e) => e.key === 'Enter' && selectIssueRow(row)}
        >
            <span class="is-dot is-{row.state}"></span>
            <span class="is-num">#{row.number}</span>
            <span class="is-title">{row.title}</span>
            {#if row.state === "no-patch"}
                <span class="is-badge is-missing">∅ patch</span>
                <span class="is-badge is-missing">? tests</span>
                <button
                    class="is-reprompt-btn"
                    onclick={(e) => { e.stopPropagation(); repromptIssue(t, row); }}
                    disabled={!!repromptBusy}
                    title="Rejouer l'implémentation de cette issue"
                >{repromptBusy === row.number ? "…" : "↺"}</button>
            {:else if row.state === "patch-no-tests"}
                <span class="is-badge" class:is-ok={!row.patch?.stale} class:is-stale={row.patch?.stale}>
                    {row.patch?.stale ? "⚠ périmé" : "patch"}
                    <button class="is-reprompt-btn is-in-badge" onclick={(e) => { e.stopPropagation(); repromptIssue(t, row); }} disabled={!!repromptBusy} title={row.patch?.stale ? "Régénérer le patch" : "Rejouer l'implémentation"}>{repromptBusy === row.number ? "…" : "↺"}</button>
                    <button class="is-reject-btn" onclick={(e) => { e.stopPropagation(); rejectPatch(t, row.patch!); }} title="Rejeter ce patch">✕</button>
                </span>
                {#if !row.patch?.stale}
                    {#if row.patch?.isPureUI}
                        <span class="is-badge is-ui-only" title="Patch UI seul — pas de tests requis">UI</span>
                    {:else}
                        <button class="is-badge is-notests is-btn" onclick={(e) => { e.stopPropagation(); writeTests(t, row); }} title="Écrire les tests manquants">∅ tests ▶</button>
                    {/if}
                {/if}
            {:else}
                <span class="is-badge" class:is-ok={!row.patch?.stale} class:is-stale={row.patch?.stale}>
                    {row.patch?.stale ? "⚠ périmé" : "patch"}
                    <button class="is-reprompt-btn is-in-badge" onclick={(e) => { e.stopPropagation(); repromptIssue(t, row); }} disabled={!!repromptBusy} title={row.patch?.stale ? "Régénérer le patch" : "Rejouer l'implémentation"}>{repromptBusy === row.number ? "…" : "↺"}</button>
                    <button class="is-reject-btn" onclick={(e) => { e.stopPropagation(); rejectPatch(t, row.patch!); }} title="Rejeter ce patch">✕</button>
                </span>
                {#if !row.patch?.stale}
                    <button class="is-badge is-ok is-btn" onclick={(e) => { e.stopPropagation(); runTests(t, row); }} title="Lancer les tests">
                        {$testRunState.planId === t.fullPlanId && $testRunState.issueNumber === row.number && $testRunState.running ? "…" : "▶"} tests
                    </button>
                {/if}
            {/if}
            {#if row.patch?.durationMs != null}
                <span class="is-duration">{formatDuration(row.patch.durationMs)}</span>
            {/if}
        </div>
    {/snippet}

    {#if task.type === "fullplan" && fullPlanDetail && issueRows.length > 0 && task.status !== "validation" && task.status !== "merged"}
        {@const fp = fullPlanDetail}
        {@const allGroups = fp.stepFiles?.length
            ? fp.stepFiles.map(sf => ({
                keyword: sf.filename.replace(".md", ""),
                issues: sf.issues.map(n => issueRows.find(r => r.number === n) ?? { number: n, title: `#${n}` })
            }))
            : [
                ...fp.subStacks,
                ...(fp.residualIssues?.length ? [{ keyword: "résiduel", issues: fp.residualIssues }] : [])
            ]
        }
        <div class="fp-tree">
            {#if sandboxError}
                <div class="sandbox-error">
                    <span>⚠ {sandboxError}</span>
                    <button onclick={() => sandboxError = ""}>✕</button>
                </div>
            {/if}
            <div class="fp-issue-panel">
                <div class="fp-issue-header">
                    {#if selectedIssueRow}
                        <span class="fp-issue-num">#{selectedIssueRow.number}</span>
                        <span class="fp-issue-title">{selectedIssueDetail?.title ?? selectedIssueRow.title}</span>
                    {:else}
                        <span class="fp-issue-placeholder">— sélectionnez une issue</span>
                    {/if}
                    {#if selectedIssueRow?.patch}
                        {#if sandboxState?.applied.includes(selectedIssueRow.patch.name)}
                            <button class="fp-tester-btn is-applied" onclick={() => sandboxUnapply(task, selectedIssueRow!.patch!.name)} disabled={!!sandboxBusy}>{sandboxBusy === selectedIssueRow.patch.name ? "…" : "↩"}</button>
                        {:else}
                            <button class="fp-tester-btn" onclick={() => sandboxApply(task, selectedIssueRow!.patch!.name)} disabled={!!sandboxBusy}>{sandboxBusy === selectedIssueRow.patch.name ? "…" : "↓ tester"}</button>
                        {/if}
                    {:else}
                        <button class="fp-tester-btn" disabled>↓ tester</button>
                    {/if}
                </div>
                {#if loadingIssueDetail}
                    <div class="fp-issue-desc">…</div>
                {:else if selectedIssueDetail?.body}
                    <div class="fp-issue-desc">{selectedIssueDetail.body}</div>
                {/if}
            </div>
            <div class="fp-trunk">
                {#each allGroups as group, gi}
                    {@const isLast = gi === allGroups.length - 1}
                    <div class="fp-group" class:fp-last={isLast}>
                        <div class="fp-node-row">
                            <span class="fp-group-symbol">+</span>
                            <span class="fp-group-text">[ {group.keyword} ]</span>
                        </div>
                        {#if group.issues.length > 0}
                            <div class="fp-children">
                                {#each group.issues as issue}
                                    {@const row = issueRows.find(r => r.number === issue.number)}
                                    {#if row}
                                        <div class="fp-child-row">
                                            {@render issueRow(task, row)}
                                        </div>
                                    {/if}
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
            <div class="issue-status-footer">
                {#if staleRows.length > 0}
                    <button class="wf-btn wf-stale" onclick={() => repromptAllStale(task)} disabled={!!repromptBusy}>{repromptBusy ? "…" : `↺ Régénérer ${staleRows.length} patch${staleRows.length > 1 ? "s" : ""} périmé${staleRows.length > 1 ? "s" : ""}`}</button>
                {/if}
                {#if patches.length > 0 && !staleRows.length && task.status !== "validation" && task.status !== "merged"}
                    <button class="wf-btn wf-commit-all" onclick={() => commitAllPatches(task)} disabled={commitAllBusy}>{commitAllBusy ? `… ${commitAllProgress?.done ?? 0}/${commitAllProgress?.total ?? 0}` : `↓ Commiter les ${patches.length} patches`}</button>
                {/if}
                <button class="wf-btn" onclick={() => closeFullPlanIssues(task)} disabled={closingIssues}>{closingIssues ? "…" : `✕ Fermer les ${issueRows.length} issues`}</button>
            </div>
            {#if commitAllProgress}
                <div class="commit-all-status" class:is-error={!!commitAllProgress.error} class:is-done={!commitAllBusy && !commitAllProgress.error}>
                    {#if commitAllProgress.error}
                        ✕ {commitAllProgress.error}
                    {:else if !commitAllBusy}
                        ✓ {commitAllProgress.done} commits sur {commitAllProgress.branch}
                    {:else}
                        {commitAllProgress.current} ({commitAllProgress.done}/{commitAllProgress.total})
                    {/if}
                </div>
            {/if}
        </div>
    {/if}

    {#if task.status === "planification" || task.status === "failed"}
        <div class="stuck-bar">
            <span class="stuck-label">{task.status === "planification" ? "⚠ agent inactif — task bloquée" : "✕ échec"}</span>
            <button class="stuck-reset" onclick={() => resetTask(task)} disabled={resetting}>{resetting ? "…" : "↺ Réinitialiser → spécification"}</button>
        </div>
    {/if}

    <div class="wf-bar">
        <button class="wf-btn" class:wf-active={btnVariant(0) === "active"} class:wf-disabled={btnVariant(0) !== "active"} disabled={btnVariant(0) !== "active"} onclick={() => selectedPanel = "plan"}>Planifier</button>
        <span class="wf-arrow">›</span>
        <button class="wf-btn" class:wf-active={btnVariant(1) === "active"} class:wf-disabled={btnVariant(1) !== "active"} disabled={btnVariant(1) !== "active"} onclick={() => selectedPanel = "implement"}>Implémenter</button>
        <span class="wf-arrow">›</span>
        <button class="wf-btn" class:wf-active={btnVariant(2) === "active"} class:wf-disabled={btnVariant(2) !== "active"} disabled={btnVariant(2) !== "active" || branchCreating} onclick={() => task.branch ? (selectedPanel = "commit") : createBranchAndShowDiff(task)}>{branchCreating ? "Création…" : "Commiter"}</button>
        <span class="wf-arrow">›</span>
        <button class="wf-btn" class:wf-active={btnVariant(3) === "active"} class:wf-secondary={btnVariant(3) === "secondary" || (!!task.branch && btnVariant(3) === "disabled")} class:wf-disabled={!task.branch} disabled={!task.branch} onclick={() => { selectedPanel = "push"; if (task.branch) loadCommitsAhead(task.id); }}>Push</button>
        <span class="wf-arrow">›</span>
        <button class="wf-btn wf-disabled" disabled>Merge</button>
    </div>

    {#if wfError}
        <div class="wf-error">{wfError}</div>
    {/if}

    {#if $agentRunState.running && $agentRunState.taskId === task.id}
        <div class="central-input-bar">
            <input class="central-input" placeholder="Envoyer un message à l'agent…" bind:value={centralInput} disabled={sendingCentralInput} onkeydown={(e) => e.key === 'Enter' && sendCentralInput(task.id)} />
            <button class="central-input-send" onclick={() => sendCentralInput(task.id)} disabled={sendingCentralInput || !centralInput.trim()}>{sendingCentralInput ? "…" : "↵"}</button>
        </div>
    {/if}

    {#if selectedPanel === "plan"}
        <div class="plan-scene-hint">↗ Scène principale</div>
        {#if planLoading}
            <div class="plan-loading">Chargement du plan…</div>
        {:else if planContent}
            <pre class="plan-content">{planContent}</pre>
        {:else}
            <div class="plan-empty">Aucun plan disponible</div>
            <button class="impl-skip" onclick={() => skipPlan(task)} disabled={skippingPlan}>{skippingPlan ? "…" : "→ Sauter la planification"}</button>
        {/if}
        {#if task.planUsage}
            <PromptUsage usage={task.planUsage} totalUsage={task.totalUsage} label="Plan" />
        {/if}

    {:else if selectedPanel === "implement"}
        <div class="impl-actions">
            {#if task.branch}
                {#if diffContent !== null}
                    {@const diffSummary = formatDiffSummary(diffContent)}
                    {#if diffSummary.fileCount > 0}
                        <div class="diff-summary">
                            <span class="diff-summary-count">{diffSummary.fileCount} fichier{diffSummary.fileCount > 1 ? "s" : ""} modifié{diffSummary.fileCount > 1 ? "s" : ""}</span>
                            <button class="impl-skip" onclick={() => selectedPanel = "commit"}>Voir diff →</button>
                        </div>
                    {:else}
                        <button class="impl-skip" onclick={() => selectedPanel = "commit"}>→ Commiter</button>
                    {/if}
                {:else}
                    <button class="impl-skip" onclick={() => loadDiff(task.id)} disabled={diffLoading}>{diffLoading ? "…" : "↺ Charger diff"}</button>
                {/if}
            {:else if planContent}
                <button class="impl-skip" onclick={() => createBranchAndShowDiff(task)} disabled={branchCreating}>{branchCreating ? "Création branche…" : "→ Créer branche + diff"}</button>
            {/if}
            {#if task.implUsage}
                <PromptUsage usage={task.implUsage} totalUsage={task.totalUsage} label="Implémentation" />
            {/if}
            {#if justFinished}
                <div class="post-run-actions">
                    <span class="post-run-hint">Run terminé —</span>
                    <button class="impl-skip" onclick={() => task.branch ? (selectedPanel = "commit") : createBranchAndShowDiff(task)}>→ Commiter</button>
                    {#if !task.branch}
                        <button class="impl-skip" onclick={() => createBranchAndShowDiff(task)} disabled={branchCreating}>{branchCreating ? "Création…" : "→ Créer branche"}</button>
                    {/if}
                </div>
            {/if}
            {#if task.status === "implementation" && !$agentRunState.running}
                <button class="impl-skip" onclick={() => markTaskImplemented(task)} disabled={markingImplemented}>{markingImplemented ? "…" : "✓ Marquer implémentée"}</button>
            {/if}
        </div>

        {#if taskDag}
            <div class="task-dag-mini">
                <div class="task-dag-label">Dépendances (#246)</div>
                <div class="task-dag-nodes">
                    {#each taskDag.steps.slice(0, 5) as step}
                        <span class="task-dag-node">#{step.id}</span>
                    {/each}
                    {#if taskDag.steps.length > 5}
                        <span class="task-dag-more">+{taskDag.steps.length - 5}</span>
                    {/if}
                </div>
            </div>
        {/if}

    {:else if selectedPanel === "commit"}
        <div class="commit-panel">
            <div class="commit-bar">
                <input class="commit-msg-input" placeholder="Message de commit…" bind:value={commitMsg} disabled={committing} />
                <button class="commit-btn" onclick={() => commitChanges(task)} disabled={!commitMsg.trim() || committing}>{committing ? "…" : "✓ Commiter"}</button>
                <button class="revert-btn" onclick={() => revertChanges(task)} disabled={reverting}>{reverting ? "…" : revertConfirm ? "Confirmer ?" : "✕ Annuler"}</button>
                <button class="diff-refresh-btn" onclick={() => loadDiff(task.id)} title="Rafraîchir">↺</button>
            </div>
            {#if diffLoading}
                <span class="diff-hint">Chargement du diff…</span>
            {:else if diffContent !== null}
                {#if diffContent.trim()}
                    <div class="diff-view">
                        {#each diffContent.split('\n') as line}
                            <div class="diff-line" class:add={line.startsWith('+') && !line.startsWith('+++')} class:del={line.startsWith('-') && !line.startsWith('---')} class:hunk={line.startsWith('@@')} class:meta={line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')}>{line || '\u200b'}</div>
                        {/each}
                    </div>
                {:else}
                    <span class="diff-hint">Aucune modification non commitée</span>
                {/if}
            {/if}
        </div>

    {:else if selectedPanel === "push"}
        <div class="push-panel">
            <span class="push-hint">
                {#if commitsAhead}
                    <strong>{commitsAhead.count}</strong> commit{commitsAhead.count > 1 ? "s" : ""} sur <code>{task.branch}</code>
                {:else}
                    Commits prêts sur <code>{task.branch}</code>
                {/if}
            </span>
            {#if commitsAhead?.commits.length}
                <div class="ahead-log">
                    {#each commitsAhead.commits as c}
                        <div class="ahead-row"><span class="ahead-sha">{c.sha}</span> <span class="ahead-msg">{c.message}</span></div>
                    {/each}
                </div>
            {/if}
            <div class="push-actions">
                <button class="wf-btn" class:wf-active={!task.pushed && !pushing} class:wf-secondary={task.pushed} onclick={() => pushBranch(task)} disabled={pushing}>{pushing ? "…" : task.pushed ? "✓ Pushé" : "↑ Push"}</button>
                <button class="wf-btn" class:wf-active={task.pushed && !merging} class:wf-disabled={!task.pushed} class:merging-spin={merging} onclick={() => mergeBranch(task)} disabled={!task.pushed || merging}>{merging ? FRAMES[frame] : "⇒ Merge → main"}</button>
                {#if task.type === "fullplan" && task.fullPlanId && issueRows.length > 0}
                    <button class="wf-btn close-issue-btn" onclick={() => closeFullPlanIssues(task)} disabled={closingIssues}>{closingIssues ? "…" : `✕ Fermer les ${issueRows.length} issues`}</button>
                {:else if task.issueNumber && linkedIssueState === "open"}
                    <button class="wf-btn close-issue-btn" onclick={() => closeLinkedIssue(task)} disabled={closingIssue} title="Fermer l'issue #{task.issueNumber} sur GitHub">{closingIssue ? "…" : "✕ Fermer #" + task.issueNumber}</button>
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
                        <div class="diff-line" class:add={line.startsWith('+') && !line.startsWith('+++')} class:del={line.startsWith('-') && !line.startsWith('---')} class:hunk={line.startsWith('@@')} class:meta={line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')}>{line || '\u200b'}</div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
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
.wf-btn.wf-stale { color: #ff9800; border-color: rgba(255,152,0,0.3); }
.wf-btn.wf-stale:hover:not(:disabled) { color: #ffb74d; border-color: rgba(255,152,0,0.6); }
.wf-btn.wf-commit-all { color: #7ec8a0; border-color: rgba(126,200,160,0.3); }
.wf-btn.wf-commit-all:hover:not(:disabled) { color: #a8e6c4; border-color: rgba(126,200,160,0.6); }
.commit-all-status { padding: 4px 8px 2px; font-size: 11px; color: #888; }
.commit-all-status.is-error { color: #e07070; }
.commit-all-status.is-done { color: #7ec8a0; }
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
.diff-summary {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.2rem 0;
}
.diff-summary-count {
    font-size: 0.65rem;
    color: var(--text-muted);
}
/* ── Actions post-run ── */
.post-run-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
    flex-wrap: wrap;
}
.post-run-hint {
    font-size: 0.65rem;
    color: #7cbf7c;
}

/* ── Input central ── */
.central-input-bar {
    display: flex;
    align-items: center;
    border-top: 1px solid var(--border);
    padding: 0.3rem 0.5rem;
    gap: 0.4rem;
}
.central-input {
    flex: 1;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    padding: 0.25rem 0.5rem;
    outline: none;
}
.central-input:focus { border-color: #9181f9; }
.central-input-send {
    background: none;
    border: 1px solid var(--border);
    border-radius: 3px;
    color: #aaa;
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0.2rem 0.5rem;
}
.central-input-send:hover:not(:disabled) { color: #9181f9; border-color: #9181f9; }
.central-input-send:disabled { opacity: 0.4; cursor: default; }

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
/* ── Arbre fullplan ── */
.fp-tree {
    border-bottom: 1px solid var(--border);
    padding-bottom: 2px;
}
/* Panel issue sélectionnée (au-dessus de l'arbre) */
.fp-issue-panel {
    padding: 5px 8px 6px;
    border-bottom: 1px solid rgba(255,248,220,0.08);
    min-height: 28px;
}
.fp-issue-header {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 20px;
}
.fp-issue-num {
    font-size: 0.6rem;
    color: cornsilk;
    flex-shrink: 0;
}
.fp-issue-title {
    font-size: 0.65rem;
    color: #888;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.fp-issue-placeholder {
    font-size: 0.6rem;
    color: #555;
    flex: 1;
}
.fp-issue-desc {
    margin-top: 4px;
    font-size: 0.6rem;
    color: #888;
    line-height: 1.4;
    max-height: 4rem;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    white-space: pre-line;
}
.fp-tester-btn {
    flex-shrink: 0;
    background: none;
    border: 1px solid #444;
    border-radius: 3px;
    cursor: pointer;
    color: #aaa;
    font-size: 0.6rem;
    padding: 2px 7px;
    transition: all 0.1s;
}
.fp-tester-btn:not(:disabled):hover {
    border-color: #aef;
    color: #aef;
}
.fp-tester-btn.is-applied {
    border-color: #f7c948;
    color: #f7c948;
}
.fp-tester-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}
/* Tronc principal */
.fp-trunk {
    position: relative;
    margin-left: 12px;
    padding-left: 14px;
    padding-top: 6px;
    --row-h: 22px;
    --sub-x: 7px;   /* centre du carré + (14px/2) */
    --sym-size: 14px;
    --dot-v: repeating-linear-gradient(to bottom, #e8e4d4 0, #e8e4d4 2px, transparent 2px, transparent 5px);
    --dot-h: repeating-linear-gradient(to right, #e8e4d4 0, #e8e4d4 2px, transparent 2px, transparent 5px);
}
/* Chaque groupe/stack */
.fp-group {
    position: relative;
    margin-bottom: 2px;
}
.fp-group:not(:first-child) {
    margin-top: 4px;
}
/* Segment de spine entrant : haut → centre du nœud */
.fp-group::before {
    content: '';
    position: absolute;
    left: -14px;
    top: 0;
    width: 1px;
    height: calc(var(--row-h) / 2);
    background: var(--dot-v);
}
/* Premier groupe : la spine remonte dans le padding-top du trunk vers le panel */
.fp-group:first-child::before {
    top: -6px;
    height: calc(6px + var(--row-h) / 2);
}
/* Segment de spine sortant : centre du nœud → bas du groupe (non-derniers) */
.fp-group:not(.fp-last)::after {
    content: '';
    position: absolute;
    left: -14px;
    top: calc(var(--row-h) / 2);
    bottom: 0;
    width: 1px;
    background: var(--dot-v);
}
/* Ligne de nœud : [label] ─ [première issue] */
.fp-node-row {
    display: flex;
    align-items: center;
    position: relative;
    height: var(--row-h);  /* hauteur fixe → 50% = calc(--row-h/2) exactement */
}
/* Branche horizontale depuis la spine principale vers le nœud */
.fp-node-row::before {
    content: '';
    position: absolute;
    left: -14px;
    top: 50%;
    width: 14px;
    height: 1px;
    background: var(--dot-h);
    transform: translateY(-0.5px);
}
/* Connexion verticale depuis le label vers les issues du groupe */
.fp-group:has(.fp-children) .fp-node-row::after {
    content: '';
    position: absolute;
    left: var(--sub-x);
    top: 50%;
    bottom: 0;
    width: 1px;
    background: var(--dot-v);
}
/* Nœud encadré du groupe (carré avec symbole +) */
.fp-group-symbol {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--sym-size);
    height: var(--sym-size);
    flex-shrink: 0;
    font-size: 0.6rem;
    line-height: 0;
    color: #e8e4d4;
    border: 1px solid rgba(232, 228, 212, 0.3);
    border-radius: 2px;
    position: relative;
    z-index: 1;
    background: #111;  /* masque la ligne verticale qui passe derrière */
    box-sizing: border-box;
}
/* Texte du groupe — discret, hors encadré */
.fp-group-text {
    font-size: 0.57rem;
    color: #888;
    white-space: nowrap;
    margin-left: 5px;
}
/* Issues du groupe — alignées sous le label */
.fp-children {
    display: flex;
    flex-direction: column;
    margin-left: var(--sub-x);
    padding-left: 12px;
}
.fp-child-row {
    position: relative;
    padding: 1px 0;
}
/* Segment vertical de la sous-spine :
   - s'arrête au milieu pour le dernier enfant
   - pleine hauteur pour les autres */
.fp-child-row::before {
    content: '';
    position: absolute;
    left: -12px;
    top: 0;
    width: 1px;
    height: 50%;
    background: var(--dot-v);
}
.fp-child-row:not(:last-child)::before {
    height: 100%;
}
/* Branche horizontale depuis la sous-spine vers l'issue enfant */
.fp-child-row::after {
    content: '';
    position: absolute;
    left: -12px;
    top: 50%;
    width: 12px;
    height: 1px;
    background: var(--dot-h);
    transform: translateY(-0.5px);
}
/* ── Issue row (contenu) ── */
.issue-status-row {
    display: flex; align-items: center; gap: 6px;
    padding: 2px 6px; font-size: 0.65rem;
    flex: 1; min-width: 0;
}
.issue-status-row.clickable { cursor: pointer; }
.issue-status-row.clickable:hover { background: var(--bg-hover, #1a1a1a); border-radius: 2px; }
.issue-status-row.is-selected { background: rgba(255,248,220,0.05); border-radius: 2px; }
.is-dot {
    width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
.is-dot.is-patch-tests    { background: #4caf50; }
.is-dot.is-patch-no-tests { background: #f7c948; }
.is-dot.is-no-patch       { background: #555; }
.is-num  { color: cornsilk; flex-shrink: 0; }
.is-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #888; }
.is-badge { font-size: 0.58rem; flex-shrink: 0; padding: 1px 4px; border-radius: 3px; }
.is-badge.is-missing  { background: #2a2a2a; color: #555; }
.is-badge.is-notests  { background: rgba(247,201,72,0.15); color: #f7c948; }
.is-badge.is-ui-only  { background: #1a1a1a; color: #555; cursor: default; }
.is-duration {
    margin-left: auto;
    font-size: 0.48rem;
    font-family: 'JetBrains Mono', monospace;
    color: #2a4a2a;
    flex-shrink: 0;
}
.is-badge.is-stale    { background: rgba(255,152,0,0.15); color: #ff9800; }
.is-badge.is-ok       { background: rgba(76,175,80,0.15); color: #4caf50; }
.is-badge.is-btn      { border: none; cursor: pointer; }
.is-badge.is-btn:hover { filter: brightness(1.4); }
.is-reject-btn {
    background: none; border: none; cursor: pointer;
    color: inherit; font-size: 0.55rem; padding: 0 0 0 3px; line-height: 1;
}
.is-reject-btn:hover { color: #c8f5ca; }
.is-reprompt-btn {
    background: none; border: 1px solid rgba(76, 175, 80, 0.45); border-radius: 3px; cursor: pointer;
    color: #4caf50; font-size: 0.55rem; padding: 1px 4px; flex-shrink: 0;
    transition: color 0.1s, border-color 0.1s;
}
.is-reprompt-btn:hover { color: #c8f5ca; border-color: rgba(76, 175, 80, 0.75); }
.is-reprompt-btn:disabled { opacity: 0.4; cursor: not-allowed; }
/* ↺ intégré dans le badge patch */
.is-in-badge {
    border: none; border-radius: 0; padding: 0 1px 0 3px; font-size: inherit;
}
.is-in-badge:hover { border: none; color: #c8f5ca; }
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
.plan-loading { font-size: 0.65rem; color: var(--text-muted); padding: 0.5rem 1rem; }
.plan-empty { font-size: 0.65rem; color: var(--text-muted); padding: 0.4rem 1rem; font-style: italic; }
.plan-content {
    font-size: 0.65rem;
    font-family: 'JetBrains Mono', monospace;
    white-space: pre-wrap;
    word-break: break-word;
    padding: 0.5rem 1rem;
    color: var(--text-muted);
    max-height: 12rem;
    overflow-y: auto;
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
.push-hint strong { color: #7ec8a0; font-style: normal; }
.ahead-log { display: flex; flex-direction: column; gap: 2px; }
.ahead-row { display: flex; gap: 0.5rem; font-size: 0.6rem; line-height: 1.4; }
.ahead-sha { color: #5a6a8a; font-family: 'JetBrains Mono', monospace; flex-shrink: 0; }
.ahead-msg { color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.push-hint code {
    font-family: 'JetBrains Mono', monospace;
    color: var(--text-muted);
    background: var(--bg-subtle);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
}
.push-actions { display: flex; gap: 0.5rem; }

/* ── DAG mini ── */
.task-dag-mini {
    padding: 0.3rem 1rem;
    border-top: 1px solid var(--border);
}
.task-dag-label { font-size: 0.55rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.2rem; }
.task-dag-nodes { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.task-dag-node {
    font-size: 0.6rem;
    padding: 0.1rem 0.4rem;
    background: rgba(59,130,246,0.08);
    border: 1px solid rgba(59,130,246,0.2);
    border-radius: 2px;
    color: #3b82f6;
}
.task-dag-more { font-size: 0.6rem; color: var(--text-muted); }
</style>
