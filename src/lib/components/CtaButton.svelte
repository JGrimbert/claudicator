<script lang="ts">
    export let label: string;
    export let loading = false;
    export let disabled = false;
    export let useCase = "";
    export let onclick: (() => void) | undefined = undefined;

    const FRAMES = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
    let spinFrame = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    $: {
        if (loading && !timer) {
            timer = setInterval(() => { spinFrame = (spinFrame + 1) % FRAMES.length; }, 100);
        } else if (!loading && timer) {
            clearInterval(timer);
            timer = null;
            spinFrame = 0;
        }
    }
</script>

<button
    class="cta-btn"
    data-use-case={useCase}
    data-cta="true"
    disabled={disabled || loading}
    {onclick}
>
    {#if loading}<span class="cta-spin">{FRAMES[spinFrame]}</span>{/if}
    <span class="cta-label">{label}</span><span class="cta-arrow"> →</span>
</button>

<style>
.cta-btn {
    background: #1e1540;
    border: 1px solid #3a2e70;
    border-radius: 3px;
    font-size: 0.65rem;
    padding: 0.3rem 0.9rem;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    letter-spacing: 0.03em;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    white-space: nowrap;
}
.cta-spin {
    color: cornsilk;
    font-size: 0.65rem;
    margin-right: 0.3rem;
    opacity: 0.8;
}
.cta-label { color: var(--color-impl, #7c6af7); }
.cta-arrow { color: #fff; }
.cta-btn:hover:not(:disabled) { background: #2a1e58; border-color: #5a4a9a; }
.cta-btn:disabled { opacity: 0.35; cursor: default; }
</style>
