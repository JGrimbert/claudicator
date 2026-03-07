<script lang="ts">
    import { onMount } from "svelte";
    import TopBar from "$lib/components/TopBar.svelte";
    import IssueList from "$lib/components/IssueList.svelte";
    import AgentConsole from "$lib/components/AgentConsole.svelte";
    import ArtifactViewer from "$lib/components/ArtifactViewer.svelte";

    // ─── Colonnes redimensionnables ───────────────────────────────────────────
    const STORAGE_KEY = "claudicator:panel-widths";
    const LIMITS = { aside: [180, 600], section: [200, 600] } as const;

    function loadWidths() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const p = JSON.parse(raw);
                return {
                    aside:   Math.max(LIMITS.aside[0],   Math.min(LIMITS.aside[1],   p.aside   ?? 300)),
                    section: Math.max(LIMITS.section[0], Math.min(LIMITS.section[1], p.section ?? 340)),
                };
            }
        } catch { /* ignore */ }
        return { aside: 300, section: 340 };
    }

    let widths = { aside: 300, section: 340 };
    onMount(() => { widths = loadWidths(); });

    function saveWidths() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widths)); } catch { /* ignore */ }
    }

    let dragging: "aside" | "section" | null = null;
    let dragStartX = 0;
    let dragStartW = 0;

    function startDrag(e: MouseEvent, panel: "aside" | "section") {
        dragging = panel;
        dragStartX = e.clientX;
        dragStartW = widths[panel];
        e.preventDefault();
    }

    function onMove(e: MouseEvent) {
        if (!dragging) return;
        const delta = e.clientX - dragStartX;
        const [min, max] = LIMITS[dragging];
        const next = dragging === "aside"
            ? Math.max(min, Math.min(max, dragStartW + delta))
            : Math.max(min, Math.min(max, dragStartW - delta));
        widths = { ...widths, [dragging]: next };
    }

    function onUp() {
        if (dragging) { saveWidths(); dragging = null; }
    }
</script>

<svelte:window onmousemove={onMove} onmouseup={onUp} />

<div class="app" class:dragging>
    <TopBar />
    <div class="panels">
        <aside style="width: {widths.aside}px">
            <ArtifactViewer />
            <IssueList />
        </aside>
        <div
            class="handle"
            role="separator"
            aria-label="Redimensionner le panneau gauche"
            onmousedown={e => startDrag(e, "aside")}
            class:active={dragging === "aside"}
        ></div>
        <main>
            <AgentConsole />
        </main>
        <div
            class="handle"
            role="separator"
            aria-label="Redimensionner le panneau droit"
            onmousedown={e => startDrag(e, "section")}
            class:active={dragging === "section"}
        ></div>
        <section style="width: {widths.section}px">
            <!-- PRs, reviews, etc. -->
        </section>
    </div>
</div>

<style>
.app {
    display: flex;
    flex-direction: column;
    height: 100vh;
}
.app.dragging { user-select: none; cursor: col-resize; }
.panels {
    display: flex;
    flex: 1;
    min-height: 0;
}
aside {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
}
main {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
section {
    flex-shrink: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.handle {
    flex-shrink: 0;
    width: 6px;
    cursor: col-resize;
    border-left: 1px solid #1e1e1e;
    border-right: 1px solid #1e1e1e;
    background: transparent;
    transition: border-color 0.15s;
}
.handle:hover, .handle.active { border-color: #3a3a3a; }
</style>
