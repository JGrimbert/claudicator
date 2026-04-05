<script lang="ts">
    import { afterUpdate, onMount, onDestroy } from "svelte";
    import { issueAnalysis, agentRunState, agentState, hoveredIssueNumber, issueStates, hasInvalidatedSlots } from "$lib/stores/agent";
    import IssueGroups from "./IssueGroups.svelte";
    import MermaidDiagram from "./MermaidDiagram.svelte";
    import RoadmapChat from "./RoadmapChat.svelte";
    import PlanBatchConsole from "./PlanBatchConsole.svelte";
    import { parseGroups } from "./IssueAnalysis.helpers";
    import { readAnalysisStream } from "$lib/utils/analysisStream";

    const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frame = 0;
    let spinnerInterval: ReturnType<typeof setInterval> | null = null;

    let logArea: HTMLDivElement;
    let autoScroll = true;
    let activeView: 'roadmap' | 'groups' = 'roadmap';

    // ── Roadmaps nommées ──────────────────────────────────────────────────
    let roadmaps: Array<{ id: string; name: string; updatedAt: string }> = [];
    let showNewRoadmap = false;
    let newRoadmapName = "";

    async function loadRoadmaps() {
        try {
            const r = await fetch("/api/issues/roadmaps");
            if (r.ok) roadmaps = await r.json();
        } catch { /* silencieux */ }
    }

    async function onRoadmapChange(e: Event) {
        const select = e.target as HTMLSelectElement;
        const val = select.value;
        if (val === "__new__") {
            select.value = $issueAnalysis.roadmapId ?? "";
            showNewRoadmap = true;
            return;
        }
        issueAnalysis.update(s => ({ ...s, roadmapId: val || null, result: null, logs: [] }));
        const url = val ? `/api/issues/analysis?id=${val}` : "/api/issues/analysis";
        try {
            const r = await fetch(url);
            if (r.ok) {
                const text = await r.text();
                if (text.trim()) issueAnalysis.update(s => ({ ...s, result: text }));
            }
        } catch { /* silencieux */ }
    }

    async function createNewRoadmap() {
        if (!newRoadmapName.trim()) return;
        const slug = newRoadmapName.trim().toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        showNewRoadmap = false;
        newRoadmapName = "";
        issueAnalysis.update(s => ({ ...s, roadmapId: slug, result: null, logs: [], running: true, dismissed: false }));
        try {
            const res = await fetch("/api/issues/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roadmapId: slug })
            });
            if (!res.ok || !res.body) { issueAnalysis.update(s => ({ ...s, running: false })); return; }
            await readAnalysisStream(res, entry => issueAnalysis.update(s => ({ ...s, logs: [...s.logs, entry] })));
        } finally {
            try {
                const r = await fetch(`/api/issues/analysis?id=${slug}`);
                if (r.ok) {
                    const text = await r.text();
                    if (text.trim()) {
                        issueAnalysis.update(s => ({ ...s, running: false, result: text }));
                        await loadRoadmaps();
                        return;
                    }
                }
            } catch { /* silencieux */ }
            issueAnalysis.update(s => ({ ...s, running: false }));
        }
    }

    onMount(() => {
        spinnerInterval = setInterval(() => { frame = (frame + 1) % FRAMES.length; }, 80);
        loadResult();
        loadRoadmaps();
        loadSnapshot();
    });
    onDestroy(() => { if (spinnerInterval) clearInterval(spinnerInterval); });

    afterUpdate(() => {
        if (autoScroll && logArea) logArea.scrollTop = logArea.scrollHeight;
    });

    function onScroll() {
        if (!logArea) return;
        const atBottom = logArea.scrollHeight - logArea.scrollTop - logArea.clientHeight < 40;
        autoScroll = atBottom;
    }

    async function loadSnapshot() {
        try {
            const r = await fetch("/api/issues/snapshot");
            if (!r.ok) return;
            const { snapshot } = await r.json();
            if (!snapshot?.length) return;
            const map = new Map<number, string>();
            for (const s of snapshot) map.set(s.number, s.state ?? "open");
            issueStates.set(map);
        } catch { /* silencieux */ }
    }

    async function loadResult() {
        if ($issueAnalysis.result || $issueAnalysis.dismissed) return;
        try {
            const r = await fetch("/api/issues/analysis");
            if (r.ok) {
                const text = await r.text();
                if (text.trim()) issueAnalysis.update(s => ({ ...s, result: text }));
            }
        } catch { /* silencieux */ }
    }

    async function openIssue(number: number) {
        agentState.update(s => ({ ...s, status: "loading", plan: null }));
        try {
            const res = await fetch(`/api/issue?number=${number}`);
            if (!res.ok) return;
            const full = await res.json();
            agentState.update(s => ({
                ...s,
                issue: full,
                status: "idle",
                navigationStack: [],
                knownSubIssueNumbers: [
                    ...new Set([...s.knownSubIssueNumbers, ...(full.subIssues?.map((si: any) => si.number) ?? [])])
                ]
            }));
        } catch {
            agentState.update(s => ({ ...s, status: "idle" }));
        }
    }

    async function triggerRegenerate() {
        const roadmapId = $issueAnalysis.roadmapId;
        issueAnalysis.update(s => ({ ...s, running: true, result: null, logs: [], dismissed: false }));
        try {
            const res = await fetch("/api/issues/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roadmapId })
            });
            if (!res.ok || !res.body) { issueAnalysis.update(s => ({ ...s, running: false })); return; }
            await readAnalysisStream(res, entry => issueAnalysis.update(s => ({ ...s, logs: [...s.logs, entry] })));
        } finally {
            const url = roadmapId ? `/api/issues/analysis?id=${roadmapId}` : "/api/issues/analysis";
            try {
                const r = await fetch(url);
                if (r.ok) {
                    const text = await r.text();
                    if (text.trim()) {
                        issueAnalysis.update(s => ({ ...s, running: false, result: text }));
                        await loadSnapshot();
                        return;
                    }
                }
            } catch { /* silencieux */ }
            issueAnalysis.update(s => ({ ...s, running: false }));
        }
    }

    $: visibleLogs = $issueAnalysis.logs.filter(l => l.type !== "usage" && !/^\[pid:\d+\]$/.test(l.line));
    $: systemLogs  = $issueAnalysis.logs.filter(l => l.type === "system" && !/^\[pid:\d+\]$/.test(l.line));
    $: lastStatus  = systemLogs.length > 0 ? systemLogs[systemLogs.length - 1].line : "";
    $: groups = $issueAnalysis.result ? parseGroups($issueAnalysis.result) : [];
    $: isActive = $issueAnalysis.running || $issueAnalysis.updating || $issueAnalysis.chatRunning;
    $: activeLabel = $issueAnalysis.chatRunning ? "Raffinement de la roadmap" : $issueAnalysis.updating ? "Intégration des issues" : "Analyse des issues";
    $: activeHint  = $issueAnalysis.chatRunning ? "Raffinement en cours…" : $issueAnalysis.updating ? "Intégration des nouvelles issues…" : "Initialisation de l'analyse…";
</script>

<div class="analysis">
    <div class="analysis-header">
        <span class="dot" class:running={isActive}></span>
        <span class="label">{activeLabel}</span>
        {#if roadmaps.length > 0 || $issueAnalysis.roadmapId || $issueAnalysis.result}
            <div class="roadmap-selector">
                <select onchange={onRoadmapChange} value={$issueAnalysis.roadmapId ?? ""} disabled={isActive}>
                    <option value="">Analyse par défaut</option>
                    {#each roadmaps as rm}
                        <option value={rm.id}>{rm.name}</option>
                    {/each}
                    <option value="__new__">＋ Nouvelle…</option>
                </select>
            </div>
        {/if}
        {#if showNewRoadmap}
            <div class="new-roadmap-input">
                <input
                    bind:value={newRoadmapName}
                    placeholder="Nom de la roadmap…"
                    onkeydown={(e) => { if (e.key === "Enter") createNewRoadmap(); if (e.key === "Escape") { showNewRoadmap = false; newRoadmapName = ""; } }}
                    autofocus
                />
                <button onclick={createNewRoadmap} disabled={!newRoadmapName.trim()}>→</button>
                <button onclick={() => { showNewRoadmap = false; newRoadmapName = ""; }}>✕</button>
            </div>
        {/if}
        <button
            class="btn-view-toggle"
            class:active={activeView === 'groups'}
            onclick={() => activeView = activeView === 'groups' ? 'roadmap' : 'groups'}
            title="Regroupements / Dédoublonnage"
        >⊞</button>
    </div>

    {#if activeView === 'groups'}
        <IssueGroups />
    {:else if isActive}
        <div class="log-area" bind:this={logArea} onscroll={onScroll}>
            {#if visibleLogs.length === 0}
                <span class="hint blink">{FRAMES[frame]} {activeHint}</span>
            {:else}
                {#each visibleLogs as entry}
                    <div class="log-line" class:sys={entry.type === "system"}>{entry.line}</div>
                {/each}
            {/if}
        </div>
        {#if lastStatus}
            <div class="status-bar">{FRAMES[frame]} {lastStatus}</div>
        {/if}

    {:else if $issueAnalysis.result}
        <div class="result-area">
            <div class="roadmap-inline">
                <MermaidDiagram
                    result={$issueAnalysis.result}
                    {groups}
                    hoveredIssueNumber={$hoveredIssueNumber}
                    hasInvalidated={$hasInvalidatedSlots}
                    onRegenerate={triggerRegenerate}
                    {openIssue}
                />
            </div>
            <PlanBatchConsole {groups} {frame} />
        </div>
        <RoadmapChat {frame} roadmapId={$issueAnalysis.roadmapId ?? null} />

    {:else}
        <div class="empty">
            <span class="hint">Aucune analyse disponible. Cliquez sur "Analyser" dans la liste des issues.</span>
        </div>
    {/if}
</div>

<style>
.analysis {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-deep);
    font-family: 'JetBrains Mono', monospace;
}
.analysis-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg-panel);
}
.btn-view-toggle {
    background: none;
    border: 1px solid #333;
    color: #555;
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    line-height: 1;
    transition: color 0.12s, border-color 0.12s;
    flex-shrink: 0;
}
.btn-view-toggle:hover { color: #9181f9; border-color: #4a3a8a; }
.btn-view-toggle.active { color: #9181f9; border-color: #4a3a8a; background: #1a1040; }
.dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #333;
    flex-shrink: 0;
    transition: background 0.3s;
}
.dot.running {
    background: #7c6af7;
    animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.label { font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.12em; color: #555; flex: 1; }
.log-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.6rem 1.2rem;
}
.log-area::-webkit-scrollbar { width: 4px; }
.log-area::-webkit-scrollbar-track { background: transparent; }
.log-area::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.log-line {
    font-size: 0.7rem;
    color: #aaa;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
}
.log-line.sys { color: #3a3a5a; font-style: italic; }
.hint { display: block; padding: 0.4rem 0; color: #2a2a3a; font-size: 0.68rem; font-style: italic; }
.blink { animation: blink 1.2s step-start infinite; }
@keyframes blink { 50% { opacity: 0.3; } }
.status-bar {
    padding: 0.3rem 1.2rem;
    border-top: 1px solid var(--border);
    font-size: 0.6rem;
    color: #4a9eff;
    background: var(--bg-panel);
    flex-shrink: 0;
    font-style: italic;
    opacity: 0.75;
}
.result-area {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 0.8rem 0.4rem 0.8rem 1.2rem;
    display: flex;
    flex-direction: column;
}
.roadmap-inline {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}
.empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
}
.roadmap-selector select {
    background: var(--bg-deep);
    border: 1px solid var(--border);
    color: #555;
    font-size: 0.58rem;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
    outline: none;
    max-width: 130px;
}
.roadmap-selector select:disabled { opacity: 0.4; cursor: default; }
.new-roadmap-input {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
}
.new-roadmap-input input {
    background: var(--bg-deep);
    border: 1px solid var(--border-strong);
    color: var(--text-primary);
    font-size: 0.58rem;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    outline: none;
    width: 120px;
}
.new-roadmap-input button {
    background: none;
    border: 1px solid var(--border);
    color: #555;
    font-size: 0.65rem;
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
}
.new-roadmap-input button:hover:not(:disabled) { color: var(--accent-hover); border-color: var(--accent); }
.new-roadmap-input button:disabled { opacity: 0.4; cursor: default; }
</style>
