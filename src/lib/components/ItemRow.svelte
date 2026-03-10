<script lang="ts">
    export let prefix = "";
    export let title = "";
    export let labels: Array<{ name: string; color: string }> = [];
    export let state = "open";
    export let active = false;
    export let onclick: () => void = () => {};
    export let pipelineStep: number | null = null;

    const PIPELINE_STEPS = ["plan", "impl.", "commit", "push"];
</script>

<button class="item-row" class:active class:closed={state === "closed"} {onclick}>
    <div class="item-top">
        {#if prefix}<span class="item-prefix">{prefix}</span>{/if}
        <span class="item-title">{title}</span>
    </div>

    {#if active && pipelineStep !== null}
        <div class="pipeline-track">
            {#each PIPELINE_STEPS as step, i}
                <div class="pipeline-step">
                    <div
                        class="pipeline-dot"
                        class:done={i < pipelineStep}
                        class:current={i === pipelineStep}
                    ></div>
                    <span
                        class="pipeline-name"
                        class:name-done={i < pipelineStep}
                        class:name-current={i === pipelineStep}
                    >{step}</span>
                </div>
            {/each}
        </div>
    {:else if labels.length > 0}
        <div class="item-labels">
            {#each labels as label}
                <span
                    class="label"
                    style="background: #{label.color}20; color: #{label.color}; border-color: #{label.color}40"
                >{label.name}</span>
            {/each}
        </div>
    {/if}
</button>

<style>
.item-row {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0.5rem 1rem;
    background: #111;
    border: none;
    border-bottom: 1px solid #1a1a1a;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
    gap: 0.45rem;
    overflow: visible;
}
.item-row.active { padding-bottom: 2.4rem; }
.item-row:hover { background: #161616; }
.item-row.closed { opacity: 0.55; }
.item-top {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
}
.item-prefix {
    color: #555;
    font-size: 0.7rem;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
}
.item-title {
    color: #bbb;
    font-size: 0.82rem;
    line-height: 1.3;
}
.item-row.closed .item-title { color: #555; text-decoration: line-through; }
.item-labels {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
}
.label {
    font-size: 0.6rem;
    padding: 0.05rem 0.4rem;
    border-radius: 10px;
    border: 1px solid transparent;
    font-family: 'Inter', sans-serif;
    letter-spacing: 0.03em;
}

/* ── Pipeline track ── */
.pipeline-track {
    display: flex;
    align-items: flex-start;
    gap: 1.4rem;
    position: relative;
    padding-top: 0.1rem;
    overflow: visible;
}
/* ligne de connexion */
.pipeline-track::before {
    content: "";
    position: absolute;
    top: 4px;
    left: 4px;
    right: 4px;
    height: 1px;
    background: #222;
    z-index: 0;
}
.pipeline-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    z-index: 1;
}
.pipeline-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #1a1a1a;
    border: 1px solid #282828;
    flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
}
.pipeline-dot.done {
    background: #2a4a2a;
    border-color: #3a6a3a;
}
.pipeline-dot.current {
    background: #3a2e60;
    border-color: #7c6af7;
    box-shadow: 0 0 5px #7c6af740;
}
.pipeline-name {
    position: absolute;
    top: 10px;
    left: 14px;
    font-size: 0.5rem;
    font-family: 'JetBrains Mono', monospace;
    color: #2a2a2a;
    white-space: nowrap;
    transform: rotate(38deg);
    transform-origin: left center;
    line-height: 1;
    letter-spacing: 0.03em;
    pointer-events: none;
}
.pipeline-name.name-done    { color: #3a5a3a; }
.pipeline-name.name-current { color: #7c6af7; }
</style>
