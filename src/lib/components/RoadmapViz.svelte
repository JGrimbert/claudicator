<script lang="ts">
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import { JgrRoadmap, JgrDag } from "jgr-ui";
    import type { RoadmapData, IssueCluster } from "jgr-ui";
    import IssueGroups from "$lib/components/IssueGroups.svelte";
    import { agentState, projetPanelTab, pendingSelectTaskId, taskIssueNumbers, evalIssueDag } from "$lib/stores/agent";
    type Status = "loading" | "ok" | "empty" | "generating" | "error";

    let status: Status = $state("loading");
    let roadmap: RoadmapData | undefined = $state(undefined);
    let clusters: IssueCluster[] = $state([]);

    onMount(() => {
        (async () => {
            try {
                const res = await fetch("/api/roadmap-data", { cache: "no-store" });
                if (res.ok) {
                    const data = await res.json();
                    roadmap = data ?? undefined;
                }
                status = roadmap ? "ok" : "empty";
            } catch {
                status = "empty";
            }

            try {
                const r = await fetch("/api/issues/groups?min=3");
                if (r.ok) {
                    const data = await r.json();
                    clusters = (data.groups ?? []).map((g: any) => ({
                        keyword: g.keyword,
                        keywords: g.keywords ?? [g.keyword],
                        issues: (g.issues ?? []).map((i: any) => typeof i === "number" ? i : i.number),
                        score: g.score ?? 0,
                        hasParent: g.hasParent ?? false,
                        subdivisions: (g.subdivisions ?? []).map((s: any) => ({
                            keyword: s.keyword,
                            issues: (s.issues ?? []).map((i: any) => typeof i === "number" ? i : i.number),
                        })),
                    }));
                }
            } catch { /* ignore */ }
        })();

        const es = new EventSource("/api/roadmap-watch");
        es.onmessage = (e) => {
            if (e.data === "changed") fetchRoadmapData();
        };

        return () => es.close();
    });

    async function fetchRoadmapData() {
        try {
            const res = await fetch("/api/roadmap-data", { cache: "no-store" });
            if (res.ok) {
                const data = await res.json();
                roadmap = data ?? undefined;
            }
        } catch {
            // ignore
        }
    }

    async function handleIssueClick(n: number) {
        try {
            const res = await fetch(`/api/issue?number=${n}`);
            if (res.ok) {
                const issue = await res.json();
                agentState.update(s => ({ ...s, issue, status: "done" }));
            }
        } catch { /* ignore */ }

        if (get(taskIssueNumbers).has(n)) {
            projetPanelTab.set("tasks");
            try {
                const res = await fetch("/api/tasks");
                if (res.ok) {
                    const tasks: Array<{ id: string; issueNumber?: number }> = await res.json();
                    const task = tasks.find(t => t.issueNumber === n);
                    if (task) pendingSelectTaskId.set(task.id);
                }
            } catch { /* ignore */ }
        }
    }

    async function generate() {
        status = "generating";
        try {
            const res = await fetch("/api/roadmap-viz", { method: "POST" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                console.error("[roadmap-viz] Erreur génération:", body.error ?? res.statusText);
                status = "error";
                return;
            }
            await fetchRoadmapData();
            status = "ok";
        } catch (e) {
            console.error("[roadmap-viz] Exception:", e);
            status = "error";
        }
    }
</script>

<div class="roadmap-wrap" class:has-eval={!!$evalIssueDag}>
    <div class="roadmap-main">
        <JgrRoadmap
            {roadmap}
            {clusters}
            {status}
            onRegenerate={generate}
            onissueclick={handleIssueClick}
            extraTabs={[{ id: 'groupes', label: 'Groupes' }]}
            defaultTab="groupes"
        >
            {#snippet extracontent(tabId)}
                {#if tabId === 'groupes'}
                    <IssueGroups />
                {/if}
            {/snippet}
        </JgrRoadmap>
    </div>
    {#if $evalIssueDag}
        <div class="eval-dag-panel">
            <div class="eval-dag-header">
                <span class="eval-dag-label">DAG issues</span>
                <button class="eval-dag-close" onclick={() => evalIssueDag.set(null)}>✕</button>
            </div>
            <div class="eval-dag-body">
                <JgrDag roadmap={$evalIssueDag} onNodeClick={handleIssueClick} />
            </div>
        </div>
    {/if}
</div>

<style>
.roadmap-wrap {
    display: flex;
    flex-direction: row;
    height: 100%;
    overflow: hidden;
}
.roadmap-main {
    flex: 1;
    min-width: 0;
    overflow: hidden;
}
.eval-dag-panel {
    width: 340px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid #2a2a4a;
    background: #0d0d1a;
}
.eval-dag-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.3rem 0.6rem;
    border-bottom: 1px solid #2a2a4a;
    flex-shrink: 0;
}
.eval-dag-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.58rem;
    color: #6a5aaa;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}
.eval-dag-close {
    background: none;
    border: none;
    color: #4a4a6a;
    font-size: 0.65rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
}
.eval-dag-close:hover { color: #9181f9; }
.eval-dag-body {
    flex: 1;
    overflow: hidden;
}
</style>
