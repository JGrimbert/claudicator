<script lang="ts">
import PromptUsage from "$lib/components/consoles/PromptUsage.svelte";
import type { Task } from "$lib/types/task";

interface Props {
    task: Task;
    planContent: string | null;
    planLoading: boolean;
    skippingPlan: boolean;
    onskipplan: () => void;
}
let { task, planContent, planLoading, skippingPlan, onskipplan }: Props = $props();
</script>

<div class="plan-scene-hint">↗ Scène principale</div>
{#if planLoading}
    <div class="plan-loading">Chargement du plan…</div>
{:else if planContent}
    <pre class="plan-content">{planContent}</pre>
{:else}
    <div class="plan-empty">Aucun plan disponible</div>
    <button class="impl-skip" onclick={() => onskipplan()} disabled={skippingPlan}>{skippingPlan ? "…" : "→ Sauter la planification"}</button>
{/if}
{#if task.planUsage}
    <PromptUsage usage={task.planUsage} totalUsage={task.totalUsage} label="Plan" />
{/if}

<style>
.plan-scene-hint {
    padding: 0.6rem 1rem;
    font-size: 0.6rem;
    color: var(--border-strong);
    font-style: italic;
    font-family: 'JetBrains Mono', monospace;
    border-top: 1px solid var(--border);
}
.plan-loading { font-size: 0.65rem; color: var(--text-muted); padding: 0.5rem 1rem; }
.plan-empty { font-size: 0.65rem; color: var(--text-muted); padding: 0.4rem 1rem; font-style: italic; }
.plan-content {
    font-size: 0.65rem;
    font-family: 'JetBrains Mono', monospace;
    white-space: pre-wrap;
    word-break: break-word;
    padding: 0.5rem 1rem;
    color: var(--text-muted);
    max-height: 12rem;
    overflow-y: auto;
    border-top: 1px solid var(--border);
}
.impl-skip {
    margin: 0 1rem 0.5rem;
    background: none;
    border: 1px solid #2a3a2a;
    color: #4a7a4a;
    font-size: 0.6rem;
    padding: 0.2rem 0.55rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: color 0.1s, border-color 0.1s;
}
.impl-skip:hover { color: #7cbf7c; border-color: #4a7a4a; }
.impl-skip:disabled { opacity: 0.35; cursor: default; }
</style>
