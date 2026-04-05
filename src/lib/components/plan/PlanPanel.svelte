<script lang="ts">
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import { planGroups, planGroupsWithInvalidations, planGroupsDeduped, activePlanGroupIndex, agentState, issueAnalysis, issueStates, planPanelActiveTab } from "$lib/stores/agent";
    import type { PlanGroupDeduped, PlanGroupWithInvalidations } from "$lib/stores/agent";
    import { computeSkillCandidates, computeStepSymbols } from "./PlanPanel.helpers";
    import type { DirCluster, MixedCluster, CoalNode, HistCoalNode, IssueSlot, HistoryStats, ClusterSkill, SkillProposal, SkillCandidate } from "./PlanPanel.helpers";
    import PlanTabClusters from "./PlanTabClusters.svelte";
    import PlanTabStep     from "./PlanTabStep.svelte";
    import PlanTabHistory  from "./PlanTabHistory.svelte";
    import PlanTabSkills   from "./PlanTabSkills.svelte";
    import PlanTabSteps    from "./PlanTabSteps.svelte";

    let activeTab: "clusters" | "étape" | "étapes" | "history" | "skills" = $planPanelActiveTab;
    $: activeTab = $planPanelActiveTab;

    // ── Données clusters ─────────────────────────────────────────────────────
    let dirs:  DirCluster[]   = [];
    let mixed: MixedCluster[] = [];
    let coal:  CoalNode[]     = [];
    let histCoal:    HistCoalNode[] = [];
    let histUpToDate = false;
    let clustersLoading = false;
    let clustersLoaded  = false;

    async function loadClusters() {
        if (clustersLoading) return;
        clustersLoading = true;
        try {
            const res = await fetch("/api/clusters");
            if (res.ok) {
                const data = await res.json();
                dirs        = data.dirs  ?? [];
                mixed       = data.mixed ?? [];
                coal        = data.coal  ?? [];
                histCoal    = data.historical?.coal      ?? [];
                histUpToDate = data.historical?.isUpToDate ?? false;
            }
        } catch { /* silencieux */ }
        finally {
            clustersLoading = false;
            clustersLoaded  = true;
        }
    }

    $: if ((activeTab === "clusters" || activeTab === "étape") && !clustersLoaded) loadClusters();

    // ── Données history ──────────────────────────────────────────────────────
    let issueSlots:    IssueSlot[] = [];
    let histStats:     HistoryStats | null = null;
    let histConcepts:   HistCoalNode[] = [];
    let commitClusters: HistCoalNode[] = [];
    let historyLoaded  = false;

    async function loadHistory() {
        try {
            const res = await fetch("/api/git-history");
            if (!res.ok) return;
            const data = await res.json();
            issueSlots   = data.slots     ?? [];
            histUpToDate = data.isUpToDate ?? false;
            histStats    = data.stats      ?? null;
            histConcepts    = data.coal            ?? [];
            commitClusters  = data.commitClusters  ?? [];
        } catch {}
        finally { historyLoaded = true; }
    }

    $: if (activeTab === "history" && !historyLoaded) loadHistory();
    $: if (activeTab === "skills") {
        if (!historyLoaded)  loadHistory();
        if (!clustersLoaded) loadClusters();
        if (clusterSkillsList.length === 0) loadClusterSkills();
    }

    // ── Git history run ───────────────────────────────────────────────────────
    let gitRunning  = false;
    let gitProgress = "";

    async function runGitHistory() {
        if (gitRunning) return;
        gitRunning  = true;
        gitProgress = "démarrage…";
        try {
            const res = await fetch("/api/git-history/run", { method: "POST" });
            if (!res.ok || !res.body) { gitProgress = "erreur"; return; }
            const reader = res.body.getReader();
            const dec    = new TextDecoder();
            let buf = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split("\n\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                    const m = line.match(/^data: (.+)$/m);
                    if (!m) continue;
                    const ev = JSON.parse(m[1]);
                    if (ev.type === "progress") gitProgress = `${ev.processed}/${ev.total}`;
                    if (ev.type === "done")     gitProgress = `✓ ${ev.processedCount} commits, ${ev.coalCount} concepts`;
                    if (ev.type === "error")    gitProgress = `✗ ${ev.message}`;
                }
            }
        } catch (e: any) {
            gitProgress = `✗ ${e.message}`;
        } finally {
            gitRunning = false;
            historyLoaded  = false;
            clustersLoaded = false;
            loadHistory();
            loadClusters();
        }
    }

    // ── Task statuses ─────────────────────────────────────────────────────────
    let issueTaskStatus = new Map<number, string>();

    async function loadTaskStatuses() {
        try {
            const r = await fetch("/api/tasks");
            if (r.ok) {
                const ts: Array<{ issueNumber?: number; status: string }> = await r.json();
                const m = new Map<number, string>();
                for (const t of ts) { if (t.issueNumber) m.set(t.issueNumber, t.status); }
                issueTaskStatus = m;
            }
        } catch { /* silencieux */ }
        await autoReprocessDoneGroups();
    }

    // ── Auto-suppression des étapes entièrement terminées ─────────────────────
    let autoRemovedGroups = new Set<number>();

    async function autoReprocessDoneGroups() {
        if (reprocessingGroup !== null) return;
        const groups = get(planGroupsWithInvalidations);
        for (const group of groups) {
            if (autoRemovedGroups.has(group.index)) continue;
            const allDone = group.issues.length > 0 &&
                group.issues.every(n => issueTaskStatus.get(n) === "merged" || group.invalidatedIssues.includes(n));
            if (allDone) {
                autoRemovedGroups = new Set([...autoRemovedGroups, group.index]);
                await reprocessGroup(group, true);
            }
        }
    }

    onMount(() => {
        loadTaskStatuses();
        loadSkills();
        return issueStates.subscribe(() => autoReprocessDoneGroups());
    });

    // ── Gestion des groupes ───────────────────────────────────────────────────
    let groupFeedback: Record<string, string> = {};
    let creatingGroup: string | null = null;

    async function createGroupTasks(group: PlanGroupDeduped) {
        if (creatingGroup) return;
        creatingGroup = group.name;
        groupFeedback = { ...groupFeedback, [group.name]: "…" };
        try {
            const snap = await fetch("/api/issues/snapshot");
            if (!snap.ok) return;
            const { snapshot } = await snap.json();
            const targets = (snapshot as Array<{ number: number; title: string }>)
                .filter(s => group.issues.includes(s.number));
            if (!targets.length) { groupFeedback = { ...groupFeedback, [group.name]: "Aucune issue" }; return; }
            let created = 0, existing = 0;
            await Promise.all(targets.map(async issue => {
                const r = await fetch("/api/tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: issue.title, issueNumber: issue.number })
                });
                if (r.ok) { (await r.json()).alreadyExisted ? existing++ : created++; }
                else { existing++; }
            }));
            const msg = `${created} créée${created > 1 ? "s" : ""}${existing ? `, ${existing} existaient` : ""}`;
            groupFeedback = { ...groupFeedback, [group.name]: msg };
        } finally {
            creatingGroup = null;
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
                knownSubIssueNumbers: [...new Set([...s.knownSubIssueNumbers, ...(full.subIssues?.map((si: any) => si.number) ?? [])])]
            }));
        } catch {
            agentState.update(s => ({ ...s, status: "idle" }));
        }
    }

    let reprocessingGroup: number | null = null;
    let reprocessFeedback: Record<number, string> = {};

    async function reprocessGroup(group: PlanGroupWithInvalidations, forceAll = false) {
        if (reprocessingGroup !== null) return;
        reprocessingGroup = group.index;
        try {
            const res = await fetch("/api/issues/roadmap/reprocess-group", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roadmapId: $issueAnalysis.roadmapId,
                    groupIndex: group.index,
                    closedIssues: forceAll ? group.issues : group.invalidatedIssues
                })
            });
            if (!res.ok) { reprocessFeedback = { ...reprocessFeedback, [group.index]: "erreur" }; return; }
            const data = await res.json();
            if (data.content) {
                issueAnalysis.update(s => ({ ...s, result: data.content }));
            }
            reprocessFeedback = { ...reprocessFeedback, [group.index]: "✓" };
            setTimeout(() => { reprocessFeedback = { ...reprocessFeedback, [group.index]: "" }; }, 2000);
        } catch {
            reprocessFeedback = { ...reprocessFeedback, [group.index]: "erreur" };
        } finally {
            reprocessingGroup = null;
        }
    }

    $: activeGroup = ($planGroupsDeduped[$activePlanGroupIndex] ?? null) as PlanGroupDeduped | null;

    function selectGroup(idx: number) {
        activePlanGroupIndex.set(idx);
        activeTab = "étape";
    }

    // ── Dérivations pour l'onglet étape ──────────────────────────────────────
    $: stepIssues = new Set(activeGroup?.issues ?? []);
    $: stepDirs   = dirs.filter(c => c.issues.some(n => stepIssues.has(n)));
    $: stepCoal   = coal.filter(c => c.issues.some(n => stepIssues.has(n)));
    $: stepMixed  = mixed.filter(c => c.issues.some(n => stepIssues.has(n)));
    $: stepSymbols = computeStepSymbols(stepDirs, stepCoal, stepIssues);

    // ── Clusters actifs ───────────────────────────────────────────────────────
    let clusterSkillsList: ClusterSkill[] = [];

    async function loadClusterSkills() {
        try {
            const res = await fetch("/api/skills/clusters");
            if (res.ok) clusterSkillsList = await res.json();
        } catch { /* silencieux */ }
    }

    // ── Skills générés ────────────────────────────────────────────────────────
    let skillProposals: SkillProposal[] = [];
    let skillsGenerating = false;
    let skillsError = "";

    async function loadSkills() {
        try {
            const res = await fetch("/api/skills/proposals");
            if (res.ok) skillProposals = await res.json();
        } catch { /* silencieux */ }
    }

    async function generateSkills() {
        if (skillsGenerating) return;
        skillsGenerating = true;
        skillsError = "";
        try {
            const res = await fetch("/api/skills/generate", { method: "POST" });
            if (!res.ok) { skillsError = `Erreur ${res.status}`; return; }
            const data = await res.json();
            skillProposals = data.proposals ?? [];
        } catch (e: any) {
            skillsError = e.message ?? "Erreur inconnue";
        } finally {
            skillsGenerating = false;
        }
    }

    // ── Candidats skills ──────────────────────────────────────────────────────
    $: skillCandidates = computeSkillCandidates(coal, histCoal, commitClusters) as SkillCandidate[];

    // ── Nœuds historiques matchés (pour le filtre clusters) ──────────────────
    $: matchedHistSymbolSets = new Set(
        coal.filter(n => n.histMatch).map(n => (n.histMatch!.symbols ?? []).slice().sort().join(","))
    );
</script>

<div class="panel">
    <div class="panel-tabs">
        <button class="tab" class:tab-active={activeTab === "clusters"} onclick={() => activeTab = "clusters"}>clusters</button>
        <button class="tab" class:tab-active={activeTab === "étape"}    onclick={() => activeTab = "étape"}>étape</button>
        <button class="tab" class:tab-active={activeTab === "étapes"}   onclick={() => activeTab = "étapes"}>étapes</button>
        <button class="tab" class:tab-active={activeTab === "history"}  onclick={() => activeTab = "history"}>history</button>
        <button class="tab" class:tab-active={activeTab === "skills"}   onclick={() => activeTab = "skills"}>skills</button>
        {#if activeTab === "clusters" && clustersLoaded}
            <button class="tab-refresh" onclick={() => { clustersLoaded = false; loadClusters(); }} title="Recalculer">↻</button>
        {/if}
    </div>

    <div class="content">
        {#if activeTab === "clusters"}
            <PlanTabClusters
                {dirs} {mixed} {coal} {histCoal} {histUpToDate}
                {clustersLoading} {clustersLoaded} {matchedHistSymbolSets}
            />
        {:else if activeTab === "étape"}
            <PlanTabStep
                {activeGroup} {clustersLoading} {clustersLoaded}
                {issueTaskStatus} {stepSymbols} {stepCoal} {stepDirs} {stepMixed}
                {reprocessingGroup} {reprocessFeedback}
                onreprocess={reprocessGroup}
            />
        {:else if activeTab === "history"}
            <PlanTabHistory
                {issueSlots} {histStats} {histConcepts} {histUpToDate}
                {historyLoaded} {gitRunning} {gitProgress}
                onrunGitHistory={runGitHistory}
            />
        {:else if activeTab === "skills"}
            <PlanTabSkills
                {skillCandidates} {clustersLoaded} {historyLoaded}
                {clusterSkillsList} {skillProposals} {skillsGenerating} {skillsError}
                ongenerateSkills={generateSkills}
            />
        {:else}
            <PlanTabSteps
                {issueTaskStatus} {reprocessingGroup} {reprocessFeedback}
                {creatingGroup} {groupFeedback}
                oncreateGroupTasks={createGroupTasks}
                onopenIssue={openIssue}
                onreprocess={reprocessGroup}
                onselectGroup={selectGroup}
            />
        {/if}
    </div>
</div>

<style>
.panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
}
.panel-tabs {
    display: flex;
    align-items: center;
    height: 28px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg-panel);
}
.tab {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #2e2e2e;
    padding: 0 0.55rem;
    height: 100%;
    border-right: 1px solid var(--border);
    transition: color 0.1s;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
}
.tab:hover { color: #555; }
.tab-active { color: #777; }
.tab-refresh {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.75rem;
    color: #333;
    padding: 0 0.45rem;
    height: 100%;
    margin-left: auto;
    border-left: 1px solid var(--border);
    transition: color 0.1s;
    font-family: 'JetBrains Mono', monospace;
}
.tab-refresh:hover { color: #666; }
.content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.5rem 0;
}
.content::-webkit-scrollbar { width: 4px; }
.content::-webkit-scrollbar-track { background: transparent; }
.content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
</style>
