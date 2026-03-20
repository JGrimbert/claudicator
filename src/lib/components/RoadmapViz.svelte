<script lang="ts">
    import { onMount } from "svelte";
    import { JgrRoadmap } from "jgr-ui";
    import type { RoadmapData } from "jgr-ui";
    type Status = "loading" | "ok" | "empty" | "generating" | "error";

    let status: Status = $state("loading");
    let roadmap: RoadmapData | undefined = $state(undefined);

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
        {roadmap}
        {status}
        onRegenerate={generate}
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
