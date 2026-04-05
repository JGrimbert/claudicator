<script lang="ts">
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import { JgrRoadmap } from "jgr-ui";
    import type { RoadmapData, IssueCluster } from "jgr-ui";
    import IssueGroups from "$lib/components/issues/IssueGroups.svelte";
    import { agentState, projetPanelTab, pendingSelectTaskId, taskIssueNumbers, evalIssueDag, evalIssueDagsByKeyword } from "$lib/stores/agent";
    type Status = "loading" | "ok" | "empty" | "generating" | "error";

    let status: Status = $state("loading");
    let roadmap: RoadmapData | undefined = $state(undefined);
    let clusters: IssueCluster[] = $state([]);
    let activeGroupKeyword: string | null = $state(null);

    const activeEvalDag = $derived(
        activeGroupKeyword
            ? ($evalIssueDagsByKeyword[activeGroupKeyword] ?? $evalIssueDag)
            : $evalIssueDag
    );

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

<div class="roadmap-wrap">
    <JgrRoadmap
        {roadmap}
        {clusters}
        {status}
        evalDag={activeEvalDag}
        onRegenerate={generate}
        onissueclick={handleIssueClick}
        ongroupselect={(kw) => { activeGroupKeyword = kw; }}
        extraTabs={[{ id: 'groupes', label: 'Groupes' }]}
        defaultTab="groupes"
    >
        {#snippet extracontent(tabId, selectedGroupKeyword, onGroupSelect)}
            {#if tabId === 'groupes'}
                <IssueGroups {selectedGroupKeyword} {onGroupSelect} />
            {/if}
        {/snippet}
    </JgrRoadmap>
</div>

<style>
.roadmap-wrap {
    display: flex;
    height: 100%;
    overflow: hidden;
}
</style>
