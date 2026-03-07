<script>
    import favicon from '$lib/assets/favicon.svg';
    let { children } = $props();
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
    :global(*, *::before, *::after) {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }
    :global(body) {
        background: #111;
        color: #ccc;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        height: 100vh;
        overflow: hidden;
    }
    :global(pre), :global(code), :global(.monospace) {
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
    }
    :global(::-webkit-scrollbar) {
        width: 4px;
    }
    :global(::-webkit-scrollbar-track) {
        background: transparent;
    }
    :global(::-webkit-scrollbar-thumb) {
        background: #333;
        border-radius: 2px;
    }
</style>
