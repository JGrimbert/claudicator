<script lang="ts">
    export let prefix = "";
    export let title = "";
    export let labels: Array<{ name: string; color: string }> = [];
    export let state = "open";
    export let active = false;
    export let onclick: () => void = () => {};
</script>

<button class="item-row" class:active class:closed={state === "closed"} {onclick}>
    <div class="item-top">
        {#if prefix}<span class="item-prefix">{prefix}</span>{/if}
        <span class="item-title">{title}</span>
    </div>
    {#if labels.length > 0}
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
    padding: 0.6rem 1rem;
    background: none;
    border: none;
    border-bottom: 1px solid #1a1a1a;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
    gap: 0.3rem;
}
.item-row:hover { background: #1a1a2e; }
.item-row.active {
    background: #1e1e3a;
}
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
</style>
