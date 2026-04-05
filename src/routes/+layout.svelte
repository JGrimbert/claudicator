<script>
    import favicon from '$lib/assets/favicon.svg';
    let { children } = $props();
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
    :root {
        --bg-deep:        #0c0c16;
        --bg-base:        #16161e;
        --bg-panel:       #12121a;
        --bg-subtle:      #1a1a28;
        --border:         #1e1e2e;
        --border-strong:  #2a2a3a;
        --text-primary:   #ccc;
        --text-secondary: #888;
        --text-muted:     #555;
        --text-dim:       #333;
        --color-impl:     cornsilk;
        --accent:         #7c6af7;
        --accent-hover:   #9181f9;
        --scrollbar:      #2a2a3a;
    }
    :global(*, *::before, *::after) {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }
    :global(body) {
        background: var(--bg-base);
        color: var(--text-primary);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        height: 100vh;
        overflow: hidden;
    }
    :global(pre), :global(code) {
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
    }
    :global(::-webkit-scrollbar) {
        width: 4px;
    }
    :global(::-webkit-scrollbar-track) {
        background: transparent;
    }
    :global(::-webkit-scrollbar-thumb) {
        background: var(--scrollbar);
        border-radius: 2px;
    }

    /* ── Utilitaires globaux ── */

    /* Scrollbar fine (3–4px) pour les panneaux internes */
    :global(.scroll-thin) {
        scrollbar-width: thin;
        scrollbar-color: var(--border) transparent;
    }
    :global(.scroll-thin::-webkit-scrollbar) { width: 3px; height: 3px; }
    :global(.scroll-thin::-webkit-scrollbar-track) { background: transparent; }
    :global(.scroll-thin::-webkit-scrollbar-thumb) { background: var(--border); border-radius: 2px; }
    :global(.scroll-thin::-webkit-scrollbar-thumb:hover) { background: var(--border-strong); }

    /* Label petit-caps — section headers */
    :global(.label-xs) {
        font-size: 0.58rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--text-muted);
        font-family: 'JetBrains Mono', monospace;
    }

    /* Colonne flex fill */
    :global(.fill-col) {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    /* Animation blink unifiée (variante B : 0%/100% opacity 1, 50% opacity 0) */
    @keyframes blink {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0; }
    }

    /* ── Bouton workflow (.wf-btn) — partagé entre WorkflowBar, PushMergePanel, PatchViewer, FullPlanIssueTree ── */
    :global(.wf-btn) {
        background: none;
        border: 1px solid transparent;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.6rem;
        letter-spacing: 0.04em;
        padding: 0.2rem 0.55rem;
        border-radius: 3px;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        transition: color 0.15s, border-color 0.15s;
        color: #555;
    }
    :global(.wf-btn:disabled) { opacity: 0.4; cursor: default; }
    :global(.wf-btn.wf-active) { color: var(--accent-hover); border-color: transparent; background: none; }
    :global(.wf-btn.wf-active:hover) { color: #b0a0ff; }
    :global(.wf-btn.wf-secondary) { color: #444; border-color: transparent; cursor: pointer; }
    :global(.wf-btn.wf-secondary:hover) { color: #777; border-color: #333; }
    :global(.wf-btn.wf-disabled) { color: #333; border-color: transparent; cursor: default; pointer-events: none; }
</style>
