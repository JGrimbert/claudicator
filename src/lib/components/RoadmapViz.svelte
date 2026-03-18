<script lang="ts">
    import { onMount } from "svelte";
    import { JgrRoadmap } from "jgr-ui";
    import type { RoadmapData } from "jgr-ui";

    type Status = "loading" | "ok" | "empty" | "generating" | "error";

    let status: Status = $state("loading");
    let roadmap: RoadmapData | undefined = $state(undefined);
    let iframeKey = $state(0);

    async function fetchRoadmapData() {
        try {
            const res = await fetch("/api/roadmap-data");
            if (res.ok) {
                const data = await res.json();
                roadmap = data ?? undefined;
            }
        } catch {
            // roadmap data optionnel, on ignore
        }
    }

    onMount(async () => {
        try {
            const res = await fetch("/api/roadmap-viz");
            status = res.ok ? "ok" : "empty";
            if (status === "ok") await fetchRoadmapData();
        } catch {
            status = "empty";
        }
    });

    async function generate() {
        status = "generating";
        try {
            const res = await fetch("/api/roadmap-viz", { method: "POST" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                status = "error";
                return;
            }
            iframeKey++;
            await fetchRoadmapData();
            status = "ok";
        } catch {
            status = "error";
        }
    }
</script>

<div class="roadmap-wrap">
    {#key iframeKey}
        <JgrRoadmap
            src="/api/roadmap-viz"
            {roadmap}
            {status}
            onRegenerate={generate}
        />
    {/key}
</div>

<style>
.roadmap-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}
</style>
