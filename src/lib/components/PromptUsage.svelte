<script lang="ts">
    type TokenUsage = { inputTokens: number; outputTokens: number };

    export let usage: TokenUsage | undefined = undefined;
    export let totalUsage: TokenUsage | undefined = undefined;
    export let context: { methods: number; hasAtlas: boolean } | undefined = undefined;
    export let label: string | undefined = undefined;

    function fmt(n: number): string {
        return n.toLocaleString("fr-FR");
    }

    function fmtK(n: number): string {
        return `${Math.round(n / 100) / 10}k`;
    }

    $: showTotal = !!(totalUsage && usage && (
        totalUsage.inputTokens !== usage.inputTokens ||
        totalUsage.outputTokens !== usage.outputTokens
    ));
</script>

{#if usage}
    <div class="prompt-usage">
        <div class="usage-main">
            {#if label}
                <span class="usage-label">{label}</span>
            {/if}
            <span class="usage-val">{fmt(usage.inputTokens)} envoyés</span>
            <span class="usage-sep">·</span>
            <span class="usage-val">{fmt(usage.outputTokens)} reçus</span>
            {#if context}
                <span class="usage-context">
                    {#if context.hasAtlas}<span class="atlas-badge">atlas ✓</span>{/if}
                    {#if context.methods > 0}<span class="methods-count">{context.methods} méth.</span>{/if}
                </span>
            {/if}
        </div>
        {#if showTotal && totalUsage}
            <div class="usage-total">
                Total cumulé : {fmtK(totalUsage.inputTokens)} / {fmtK(totalUsage.outputTokens)}
            </div>
        {/if}
    </div>
{/if}

<style>
.prompt-usage {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.3rem 1.2rem;
    border-top: 1px solid #1a1a2a;
    flex-shrink: 0;
    background: #07070f;
    font-family: 'JetBrains Mono', monospace;
}
.usage-main {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
}
.usage-label {
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #2a2a3a;
    flex-shrink: 0;
}
.usage-val {
    font-size: 0.63rem;
    color: #4a4a6a;
}
.usage-sep {
    font-size: 0.6rem;
    color: #222;
}
.usage-context {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-left: auto;
}
.atlas-badge {
    font-size: 0.57rem;
    color: #3a6a3a;
    background: rgba(76, 175, 80, 0.08);
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
    border: 1px solid rgba(76, 175, 80, 0.15);
}
.methods-count {
    font-size: 0.57rem;
    color: #3a3a5a;
}
.usage-total {
    font-size: 0.57rem;
    color: #333;
    padding-left: 0;
}
</style>
