<script lang="ts">
    import type { ActiveFullPlan } from "$lib/stores/agent";

    let { plan }: { plan: ActiveFullPlan } = $props();
    let content = $state("");
    let loadError = $state("");

    $effect(() => {
        if (plan.status === "done" && plan.planFile && plan.id) {
            content = "";
            loadError = "";
            fetch(`/api/issues/groups/full-plans/${plan.id}/content`)
                .then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.text();
                })
                .then(t => { content = t; })
                .catch(e => { loadError = e.message; });
        }
    });
</script>

<div class="fp-wrap">
    {#if plan.status === "generating"}
        <div class="fp-state fp-generating">
            <span class="fp-spinner">⠋</span>
            <span>Génération en cours — {plan.keyword}…</span>
        </div>
    {:else if plan.status === "error"}
        <div class="fp-state fp-error">
            Erreur — le plan complet n'a pas été généré correctement.
        </div>
    {:else if loadError}
        <div class="fp-state fp-error">{loadError}</div>
    {:else if content}
        <pre class="fp-content">{content}</pre>
    {:else}
        <div class="fp-state fp-loading">Chargement…</div>
    {/if}
</div>

<style>
    .fp-wrap {
        height: 100%;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }
    .fp-state {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 16px;
        font-size: 13px;
        color: var(--color-text-muted, #888);
    }
    .fp-error {
        color: var(--color-error, #c0392b);
    }
    .fp-spinner {
        font-family: monospace;
        animation: spin-braille 0.4s steps(8, end) infinite;
    }
    @keyframes spin-braille {
        0%   { content: "⠋"; }
        12%  { content: "⠙"; }
        25%  { content: "⠹"; }
        37%  { content: "⠸"; }
        50%  { content: "⠼"; }
        62%  { content: "⠴"; }
        75%  { content: "⠦"; }
        87%  { content: "⠧"; }
        100% { content: "⠇"; }
    }
    .fp-content {
        flex: 1;
        margin: 0;
        padding: 12px 16px;
        font-family: monospace;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
        overflow-y: auto;
        color: var(--color-text, #ccc);
        background: transparent;
    }
</style>
