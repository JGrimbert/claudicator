<script lang="ts">
    import { onMount } from "svelte";

    type Status = "loading" | "ok" | "empty" | "generating" | "error";

    let status: Status = "loading";
    let errorMsg = "";
    let iframeKey = 0; // forcer le rechargement de l'iframe

    onMount(async () => {
        try {
            const res = await fetch("/api/roadmap-viz");
            // 200 même si vide (on sert un HTML placeholder côté serveur)
            status = res.ok ? "ok" : "empty";
        } catch {
            status = "empty";
        }
    });

    async function generate() {
        status = "generating";
        errorMsg = "";
        try {
            const res = await fetch("/api/roadmap-viz", { method: "POST" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                errorMsg = body.error ?? `Erreur ${res.status}`;
                status = "error";
                return;
            }
            iframeKey++;   // déclenche le rechargement de l'iframe
            status = "ok";
        } catch (e: any) {
            errorMsg = e.message;
            status = "error";
        }
    }
</script>

<div class="roadmap-viz">

    <!-- ── Toolbar ── -->
    <div class="toolbar">
        <span class="label">◉ roadmap</span>
        <div class="toolbar-right">
            {#if status === "error"}
                <span class="err">{errorMsg}</span>
            {/if}
            <button
                class="btn-refresh"
                onclick={generate}
                disabled={status === "generating"}
                title="(Re)générer la roadmap"
            >
                {#if status === "generating"}
                    <span class="spin">···</span>
                {:else}
                    ↺
                {/if}
            </button>
        </div>
    </div>

    <!-- ── Contenu ── -->
    <div class="frame-wrap">
        {#if status === "loading"}
            <div class="placeholder"><span>Chargement···</span></div>

        {:else if status === "generating"}
            <div class="placeholder"><span>Génération de la roadmap···</span></div>

        {:else if status === "error"}
            <div class="placeholder error">
                <span>Erreur · {errorMsg}</span>
                <button onclick={generate}>Réessayer</button>
            </div>

        {:else}
            <!-- ok | empty : on laisse le serveur gérer le placeholder HTML -->
            {#key iframeKey}
                <iframe
                    src="/api/roadmap-viz"
                    title="Roadmap DAG"
                    class="viz-frame"
                ></iframe>
            {/key}
        {/if}
    </div>

</div>

<style>
.roadmap-viz {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: #1a1a1a;
}

/* ── Toolbar ── */
.toolbar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    height: 28px;
    border-bottom: 1px solid #2a2a2a;
    background: #1e1e1e;
}
.label {
    font-size: 0.65rem;
    color: #9b8db2;
    letter-spacing: 0.06em;
    font-family: monospace;
}
.toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
}
.err {
    font-size: 0.6rem;
    color: #e57373;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.btn-refresh {
    background: none;
    border: 1px solid #333;
    color: #cdb4f3;
    font-size: 0.75rem;
    padding: 1px 7px;
    border-radius: 3px;
    cursor: pointer;
    line-height: 1.6;
    transition: border-color 0.15s, color 0.15s;
    font-family: monospace;
}
.btn-refresh:hover:not(:disabled) {
    border-color: #75518f;
    color: #d5c2e3;
}
.btn-refresh:disabled { opacity: 0.4; cursor: default; }
.spin { letter-spacing: 0.2em; }

/* ── Frame ── */
.frame-wrap {
    flex: 1;
    overflow: hidden;
    position: relative;
}
.viz-frame {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
    background: #242424;
}

/* ── Placeholder ── */
.placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #555;
    font-size: 0.65rem;
    font-family: monospace;
    font-style: italic;
    background: #1a1a1a;
}
.placeholder.error { color: #e57373; font-style: normal; }
.placeholder button {
    font-size: 0.65rem;
    background: none;
    border: 1px solid #444;
    color: #cdb4f3;
    padding: 3px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-family: monospace;
}
</style>
