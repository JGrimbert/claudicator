<script lang="ts">
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import { JgrRoadmap } from "jgr-ui";
    import type { RoadmapData } from "jgr-ui";
    import { agentState, projetPanelTab, pendingSelectTaskId, taskIssueNumbers } from "$lib/stores/agent";
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

    async function handleIssueClick(n: number) {
        // Charger l'issue dans le panel artefact
        try {
            const res = await fetch(`/api/issue?number=${n}`);
            if (res.ok) {
                const issue = await res.json();
                agentState.update(s => ({ ...s, issue, status: "done" }));
            }
        } catch { /* ignore */ }

        // Si une task est liée à cette issue, activer l'onglet Tasks et sélectionner la task
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
        onissueclick={handleIssueClick}
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
