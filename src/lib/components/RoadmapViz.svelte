<script lang="ts">
    import { onMount } from "svelte";
    import { JgrRoadmap } from "jgr-ui";
    import type { RoadmapData } from "jgr-ui";
    import { dagIssueFilter, roadmapSelectedIssues, roadmapTabIssues } from "$lib/stores/agent";

    function filterRoadmapByIssues(rm: RoadmapData, issueNums: number[]): RoadmapData {
        if (issueNums.length === 0) return rm;
        const set = new Set(issueNums);
        const filtered = rm.steps.filter((s: any) => s.issues?.some((n: number) => set.has(n)));
        const keptIds = new Set(filtered.map((s: any) => s.id));
        return {
            ...rm,
            steps: filtered.map((s: any) => ({
                ...s,
                dependsOnSteps: s.dependsOnSteps?.filter((id: string) => keptIds.has(id)) ?? [],
            })),
            stats: { ...rm.stats, steps: filtered.length },
        };
    }

    type Status = "loading" | "ok" | "empty" | "generating" | "error";

    let status: Status = $state("loading");
    let roadmap: RoadmapData | undefined = $state(undefined);
    let filteredRoadmap = $derived(roadmap ? filterRoadmapByIssues(roadmap, $dagIssueFilter) : undefined);

    onMount(async () => {
        try {
            const res = await fetch("/api/roadmap-data");
            if (res.ok) {
                const data = await res.json();
                roadmap = data ?? undefined;
            }
            status = roadmap ? "ok" : "empty";
        } catch {
            status = "empty";
        }
    });

    async function fetchRoadmapData() {
        try {
            const res = await fetch("/api/roadmap-data");
            if (res.ok) {
                const data = await res.json();
                roadmap = data ?? undefined;
            }
        } catch {
            // ignore
        }
    }

    async function generate() {
        status = "generating";
        try {
            const res = await fetch("/api/roadmap-viz", { method: "POST" });
            if (!res.ok) {
                status = "error";
                return;
            }
            await fetchRoadmapData();
            status = "ok";
        } catch {
            status = "error";
        }
    }
</script>

<div class="roadmap-wrap">
    <JgrRoadmap
        roadmap={filteredRoadmap}
        {status}
        onRegenerate={generate}
        onissuefilter={(issues) => roadmapSelectedIssues.set(issues)}
        ontabchange={(issues) => { roadmapTabIssues.set(issues); roadmapSelectedIssues.set([]); }}
    />
</div>

<style>
.roadmap-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}
</style>
