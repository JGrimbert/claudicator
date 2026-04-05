<script lang="ts">
    import { planGroupsDeduped, activePlanGroupIndex } from "$lib/stores/agent";
    import type { PlanGroupDeduped, PlanGroupWithInvalidations } from "$lib/stores/agent";

    let {
        issueTaskStatus,
        reprocessingGroup,
        reprocessFeedback,
        creatingGroup,
        groupFeedback,
        oncreateGroupTasks,
        onopenIssue,
        onreprocess,
        onselectGroup,
    }: {
        issueTaskStatus:    Map<number, string>;
        reprocessingGroup:  number | null;
        reprocessFeedback:  Record<number, string>;
        creatingGroup:      string | null;
        groupFeedback:      Record<string, string>;
        oncreateGroupTasks: (group: PlanGroupDeduped) => void;
        onopenIssue:        (n: number) => void;
        onreprocess:        (group: PlanGroupWithInvalidations, forceAll?: boolean) => void;
        onselectGroup:      (idx: number) => void;
    } = $props();
</script>

{#if $planGroupsDeduped.length === 0}
    <p class="hint">Aucune roadmap disponible</p>
{:else}
    {#each $planGroupsDeduped as group}
        {@const allDone = group.issues.length > 0 && group.issues.every(n => issueTaskStatus.get(n) === "merged" || group.invalidatedIssues.includes(n))}
        {@const isMilestone = group.issues.length === 0}
        {@const isDeduped = !isMilestone && group.displayIssues.length === 0}
        <div class="step-card"
            class:step-active={$activePlanGroupIndex === group.index - 1}
            class:step-card--invalid={group.invalidatedIssues.length > 0}
            class:step-card--all-done={allDone}
            class:step-card--milestone={isMilestone}
            class:step-card--deduped={isDeduped}
        >
            <div class="step-head">
                <button class="step-title-btn" onclick={() => onselectGroup(group.index - 1)}>
                    <span class="step-index">{group.index}</span>
                    <span class="step-name">{group.name}</span>
                </button>
                {#if allDone}
                    <span class="invalid-badge all-done-badge" title="Toutes les issues sont terminées">✓ tout terminé</span>
                    <button
                        class="btn-reprocess btn-remove-step"
                        onclick={() => onreprocess(group, true)}
                        disabled={reprocessingGroup === group.index}
                    >{reprocessFeedback[group.index] || (reprocessingGroup === group.index ? "…" : "Supprimer l'étape")}</button>
                {:else if group.invalidatedIssues.length > 0}
                    <span class="invalid-badge" title="Issues fermées dans ce groupe">⚠ {group.invalidatedIssues.length}</span>
                    <button
                        class="btn-reprocess"
                        onclick={() => onreprocess(group)}
                        disabled={reprocessingGroup === group.index}
                    >{reprocessFeedback[group.index] || (reprocessingGroup === group.index ? "…" : "Reprocesser")}</button>
                {/if}
                {#if !isMilestone}
                    <button
                        class="btn-create-task"
                        onclick={() => oncreateGroupTasks(group)}
                        disabled={creatingGroup === group.name}
                        title="Créer les tasks pour ce groupe"
                    >{groupFeedback[group.name] ?? "＋ task"}</button>
                {/if}
            </div>
            {#if group.summary}
                <div class="step-summary">{group.summary}</div>
            {/if}
            {#if group.dependsOn.length > 0}
                <div class="step-dep">après {group.dependsOn.join(", ")}</div>
            {/if}
            {#if group.displayIssues.length > 0 || group.hiddenIssues.length > 0}
                <div class="step-issues" class:step-issues--all-done={allDone}>
                    {#each group.displayIssues as n}
                        {@const status = issueTaskStatus.get(n)}
                        {@const isClosed = group.invalidatedIssues.includes(n)}
                        <button
                            class="step-chip"
                            class:chip-closed={isClosed && !allDone}
                            class:chip-all-done={allDone}
                            class:chip-impl={!allDone && (status === "implementation" || status === "documentation")}
                            class:chip-plan={!allDone && status === "planification"}
                            class:chip-merged={!allDone && status === "merged"}
                            class:chip-failed={!allDone && status === "failed"}
                            class:chip-spec={!allDone && status === "specification"}
                            onclick={() => onopenIssue(n)}
                            title="#{n}{isClosed ? ' · fermée' : ''}{status ? ` · ${status}` : ''}"
                        >{#if isClosed}<s>#{n}</s>{:else}#{n}{/if}</button>
                    {/each}
                    {#each group.hiddenIssues as h}
                        <button
                            class="step-chip chip-hidden"
                            onclick={() => onopenIssue(h.n)}
                            title="#{h.n} · déjà au step {h.firstStep}"
                        >#{h.n}</button>
                    {/each}
                </div>
            {/if}
        </div>
    {/each}
{/if}

<style>
.hint {
    padding: 1rem 0.75rem;
    color: #333;
    font-size: 0.65rem;
    font-style: italic;
    font-family: 'JetBrains Mono', monospace;
}
.step-card {
    border-bottom: 1px solid #111;
    transition: background 0.1s;
}
.step-card:hover { background: #0a0d12; }
.step-active { background: #0d1118; }
.step-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.5rem 0.3rem 0.75rem;
}
.step-title-btn {
    all: unset;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
    cursor: pointer;
}
.step-index {
    font-size: 0.6rem;
    color: #444;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
    width: 14px;
}
.step-name {
    font-size: 0.65rem;
    color: #888;
    font-family: 'JetBrains Mono', monospace;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.btn-create-task {
    background: none;
    border: 1px solid #1a3a6a;
    color: #3a6aaa;
    font-size: 0.56rem;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
    white-space: nowrap;
    transition: color 0.15s, border-color 0.15s;
}
.btn-create-task:hover:not(:disabled) { color: cornsilk; border-color: #4a8acc; }
.btn-create-task:disabled { opacity: 0.4; cursor: default; }
.step-summary {
    font-size: 0.6rem;
    color: #555;
    font-family: 'JetBrains Mono', monospace;
    font-style: italic;
    padding: 0 0.75rem 0.2rem 1.65rem;
    line-height: 1.45;
}
.step-dep {
    font-size: 0.54rem;
    color: #3a3a5a;
    font-family: 'JetBrains Mono', monospace;
    padding: 0 0.75rem 0.2rem 1.65rem;
}
.step-issues {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.1rem 0.75rem 0.35rem 1.65rem;
}
.step-chip {
    font-size: 0.58rem;
    color: #4a9eff;
    background: #0a1020;
    border: 1px solid #1a2a40;
    border-radius: 3px;
    padding: 0.04rem 0.32rem;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
}
.step-chip:hover { color: cornsilk; border-color: #2a4a6a; }
.step-chip.chip-impl  { color: #c8a020; background: #1a1200; border-color: #4a3a00; }
.step-chip.chip-impl:hover  { color: cornsilk; border-color: #7a6000; }
.step-chip.chip-plan  { color: #f7c948; background: #1a1400; border-color: #3a2e00; }
.step-chip.chip-plan:hover  { border-color: #7a6a00; }
.step-chip.chip-merged { color: #4caf50; background: #0a1a0a; border-color: #1a3a1a; }
.step-chip.chip-merged:hover { border-color: #2a5a2a; }
.step-chip.chip-failed { color: #f44336; background: #1a0a0a; border-color: #3a1a1a; }
.step-chip.chip-spec  { color: #666; border-color: #2a2a2a; }
.step-chip.chip-closed { opacity: 0.5; color: #7a5a9a; border-color: #3a2a5a; text-decoration: none; }
.step-chip.chip-closed s { text-decoration-color: #5a3a7a; }
.step-chip.chip-all-done { color: #b07ee0; background: #0e0818; border-color: #3a1a6a; opacity: 0.75; }
.step-chip.chip-all-done:hover { color: #d4aaff; border-color: #6a3aaa; opacity: 1; }
.step-issues--all-done { opacity: 0.85; }
.step-card--invalid { border-left: 2px solid #7a4a1a; }
.step-card--milestone { opacity: 0.45; }
.step-card--milestone:hover { opacity: 0.75; }
.step-card--deduped { opacity: 0.35; }
.step-card--deduped:hover { opacity: 0.65; }
.step-chip.chip-hidden { opacity: 0.3; color: #556; border-color: #222; cursor: pointer; }
.step-chip.chip-hidden:hover { opacity: 0.7; color: #889; border-color: #444; }
.invalid-badge {
    font-size: 0.55rem;
    color: #c87a20;
    background: #1a0e00;
    border: 1px solid #4a2a00;
    border-radius: 3px;
    padding: 0.1rem 0.35rem;
    white-space: nowrap;
}
.all-done-badge { color: #b07ee0 !important; border-color: #3a1a6a !important; }
.btn-reprocess {
    font-size: 0.55rem;
    color: #c87a20;
    background: none;
    border: 1px solid #4a2a00;
    border-radius: 3px;
    padding: 0.1rem 0.4rem;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.12s, border-color 0.12s;
}
.btn-reprocess:hover:not(:disabled) { color: cornsilk; border-color: #8a5a00; }
.btn-reprocess:disabled { opacity: 0.4; cursor: default; }
.btn-remove-step { color: #b07ee0; border-color: #3a1a6a; }
.btn-remove-step:hover:not(:disabled) { color: #d4aaff; border-color: #7a4aaa; }
.step-card--all-done { border-left: 2px solid #5a2a9a; }
</style>
