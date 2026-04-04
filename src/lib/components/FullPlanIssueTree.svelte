<script lang="ts">
import { testRunState } from "$lib/stores/agent";
import type { Task, IssueRow, PatchInfo, FullPlanDetail, SandboxState, CommitAllProgress } from "$lib/types/task";

interface Props {
    task: Task;
    fullPlanDetail: FullPlanDetail;
    issueRows: IssueRow[];
    staleRows: IssueRow[];
    selectedIssueRow: IssueRow | null;
    selectedIssueDetail: { title: string; body: string } | null;
    loadingIssueDetail: boolean;
    sandboxState: SandboxState | null;
    sandboxError: string;
    sandboxBusy: string | null;
    repromptBusy: number | null;
    patches: PatchInfo[];
    commitAllBusy: boolean;
    commitAllProgress: CommitAllProgress | null;
    closingIssues: boolean;
    onselectissuerow: (row: IssueRow) => void;
    onsandboxapply: (patchName: string) => void;
    onsandboxunapply: (patchName: string) => void;
    onreprompt: (row: IssueRow) => void;
    onrepromptallstale: () => void;
    onwritetests: (row: IssueRow) => void;
    onruntests: (row: IssueRow) => void;
    oncommitall: () => void;
    oncloseissues: () => void;
    onrejectpatch: (patch: PatchInfo) => void;
    onclearsandboxerror: () => void;
}

let {
    task, fullPlanDetail, issueRows, staleRows,
    selectedIssueRow, selectedIssueDetail, loadingIssueDetail,
    sandboxState, sandboxError, sandboxBusy, repromptBusy,
    patches, commitAllBusy, commitAllProgress, closingIssues,
    onselectissuerow, onsandboxapply, onsandboxunapply, onreprompt,
    onrepromptallstale, onwritetests, onruntests, oncommitall,
    oncloseissues, onrejectpatch, onclearsandboxerror,
}: Props = $props();

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    return `${Math.round(ms / 1000)}k ms`;
}

let allGroups = $derived((() => {
    const fp = fullPlanDetail;
    return fp.stepFiles?.length
        ? fp.stepFiles.map(sf => ({
            keyword: sf.filename.replace(".md", ""),
            issues: sf.issues.map(n => issueRows.find(r => r.number === n) ?? { number: n, title: `#${n}` })
        }))
        : [
            ...fp.subStacks,
            ...(fp.residualIssues?.length ? [{ keyword: "résiduel", issues: fp.residualIssues }] : [])
        ];
})());
</script>

{#snippet issueRow(t: Task, row: IssueRow)}
    <div
        class="issue-status-row clickable"
        class:is-selected={selectedIssueRow?.number === row.number}
        onclick={(e) => { if ((e.target as HTMLElement).closest('button, .is-badge')) return; onselectissuerow(row); }}
        role="button"
        tabindex={0}
        onkeydown={(e) => e.key === 'Enter' && onselectissuerow(row)}
    >
        <span class="is-dot is-{row.state}"></span>
        <span class="is-num">#{row.number}</span>
        <span class="is-title">{row.title}</span>
        {#if row.state === "no-patch"}
            <span class="is-badge is-missing">∅ patch</span>
            <span class="is-badge is-missing">? tests</span>
            <button
                class="is-reprompt-btn"
                onclick={(e) => { e.stopPropagation(); onreprompt(row); }}
                disabled={!!repromptBusy}
                title="Rejouer l'implémentation de cette issue"
            >{repromptBusy === row.number ? "…" : "↺"}</button>
        {:else if row.state === "patch-no-tests"}
            <span class="is-badge" class:is-ok={!row.patch?.stale} class:is-stale={row.patch?.stale}>
                {row.patch?.stale ? "⚠ périmé" : "patch"}
                <button class="is-reprompt-btn is-in-badge" onclick={(e) => { e.stopPropagation(); onreprompt(row); }} disabled={!!repromptBusy} title={row.patch?.stale ? "Régénérer le patch" : "Rejouer l'implémentation"}>{repromptBusy === row.number ? "…" : "↺"}</button>
                <button class="is-reject-btn" onclick={(e) => { e.stopPropagation(); onrejectpatch(row.patch!); }} title="Rejeter ce patch">✕</button>
            </span>
            {#if !row.patch?.stale}
                {#if row.patch?.isPureUI}
                    <span class="is-badge is-ui-only" title="Patch UI seul — pas de tests requis">UI</span>
                {:else}
                    <button class="is-badge is-notests is-btn" onclick={(e) => { e.stopPropagation(); onwritetests(row); }} title="Écrire les tests manquants">∅ tests ▶</button>
                {/if}
            {/if}
        {:else}
            <span class="is-badge" class:is-ok={!row.patch?.stale} class:is-stale={row.patch?.stale}>
                {row.patch?.stale ? "⚠ périmé" : "patch"}
                <button class="is-reprompt-btn is-in-badge" onclick={(e) => { e.stopPropagation(); onreprompt(row); }} disabled={!!repromptBusy} title={row.patch?.stale ? "Régénérer le patch" : "Rejouer l'implémentation"}>{repromptBusy === row.number ? "…" : "↺"}</button>
                <button class="is-reject-btn" onclick={(e) => { e.stopPropagation(); onrejectpatch(row.patch!); }} title="Rejeter ce patch">✕</button>
            </span>
            {#if !row.patch?.stale}
                <button class="is-badge is-ok is-btn" onclick={(e) => { e.stopPropagation(); onruntests(row); }} title="Lancer les tests">
                    {$testRunState.planId === t.fullPlanId && $testRunState.issueNumber === row.number && $testRunState.running ? "…" : "▶"} tests
                </button>
            {/if}
        {/if}
        {#if row.patch?.durationMs != null}
            <span class="is-duration">{formatDuration(row.patch.durationMs)}</span>
        {/if}
    </div>
{/snippet}

<div class="fp-tree">
    {#if sandboxError}
        <div class="sandbox-error">
            <span>⚠ {sandboxError}</span>
            <button onclick={() => onclearsandboxerror()}>✕</button>
        </div>
    {/if}
    <div class="fp-issue-panel">
        <div class="fp-issue-header">
            {#if selectedIssueRow}
                <span class="fp-issue-num">#{selectedIssueRow.number}</span>
                <span class="fp-issue-title">{selectedIssueDetail?.title ?? selectedIssueRow.title}</span>
            {:else}
                <span class="fp-issue-placeholder">— sélectionnez une issue</span>
            {/if}
            {#if selectedIssueRow?.patch}
                {#if sandboxState?.applied.includes(selectedIssueRow.patch.name)}
                    <button class="fp-tester-btn is-applied" onclick={() => onsandboxunapply(selectedIssueRow!.patch!.name)} disabled={!!sandboxBusy}>{sandboxBusy === selectedIssueRow.patch.name ? "…" : "↩"}</button>
                {:else}
                    <button class="fp-tester-btn" onclick={() => onsandboxapply(selectedIssueRow!.patch!.name)} disabled={!!sandboxBusy}>{sandboxBusy === selectedIssueRow.patch.name ? "…" : "↓ tester"}</button>
                {/if}
            {:else}
                <button class="fp-tester-btn" disabled>↓ tester</button>
            {/if}
        </div>
        {#if loadingIssueDetail}
            <div class="fp-issue-desc">…</div>
        {:else if selectedIssueDetail?.body}
            <div class="fp-issue-desc">{selectedIssueDetail.body}</div>
        {/if}
    </div>
    <div class="fp-trunk">
        {#each allGroups as group, gi}
            {@const isLast = gi === allGroups.length - 1}
            <div class="fp-group" class:fp-last={isLast}>
                <div class="fp-node-row">
                    <span class="fp-group-symbol">+</span>
                    <span class="fp-group-text">[ {group.keyword} ]</span>
                </div>
                {#if group.issues.length > 0}
                    <div class="fp-children">
                        {#each group.issues as issue}
                            {@const row = issueRows.find(r => r.number === issue.number)}
                            {#if row}
                                <div class="fp-child-row">
                                    {@render issueRow(task, row)}
                                </div>
                            {/if}
                        {/each}
                    </div>
                {/if}
            </div>
        {/each}
    </div>
    <div class="issue-status-footer">
        {#if staleRows.length > 0}
            <button class="wf-btn wf-stale" onclick={() => onrepromptallstale()} disabled={!!repromptBusy}>{repromptBusy ? "…" : `↺ Régénérer ${staleRows.length} patch${staleRows.length > 1 ? "s" : ""} périmé${staleRows.length > 1 ? "s" : ""}`}</button>
        {/if}
        {#if patches.length > 0 && !staleRows.length && task.status !== "validation" && task.status !== "merged"}
            <button class="wf-btn wf-commit-all" onclick={() => oncommitall()} disabled={commitAllBusy}>{commitAllBusy ? `… ${commitAllProgress?.done ?? 0}/${commitAllProgress?.total ?? 0}` : `↓ Commiter les ${patches.length} patches`}</button>
        {/if}
        <button class="wf-btn" onclick={() => oncloseissues()} disabled={closingIssues}>{closingIssues ? "…" : `✕ Fermer les ${issueRows.length} issues`}</button>
    </div>
    {#if commitAllProgress}
        <div class="commit-all-status" class:is-error={!!commitAllProgress.error} class:is-done={!commitAllBusy && !commitAllProgress.error}>
            {#if commitAllProgress.error}
                ✕ {commitAllProgress.error}
            {:else if !commitAllBusy}
                ✓ {commitAllProgress.done} commits sur {commitAllProgress.branch}
            {:else}
                {commitAllProgress.current} ({commitAllProgress.done}/{commitAllProgress.total})
            {/if}
        </div>
    {/if}
</div>

<style>
/* ── Arbre fullplan ── */
.fp-tree {
    border-bottom: 1px solid var(--border);
    padding-bottom: 2px;
}
.fp-issue-panel {
    padding: 5px 8px 6px;
    border-bottom: 1px solid rgba(255,248,220,0.08);
    min-height: 28px;
}
.fp-issue-header {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 20px;
}
.fp-issue-num {
    font-size: 0.6rem;
    color: cornsilk;
    flex-shrink: 0;
}
.fp-issue-title {
    font-size: 0.65rem;
    color: #888;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.fp-issue-placeholder {
    font-size: 0.6rem;
    color: #555;
    flex: 1;
}
.fp-issue-desc {
    margin-top: 4px;
    font-size: 0.6rem;
    color: #888;
    line-height: 1.4;
    max-height: 4rem;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    white-space: pre-line;
}
.fp-tester-btn {
    flex-shrink: 0;
    background: none;
    border: 1px solid #444;
    border-radius: 3px;
    cursor: pointer;
    color: #aaa;
    font-size: 0.6rem;
    padding: 2px 7px;
    transition: all 0.1s;
}
.fp-tester-btn:not(:disabled):hover { border-color: #aef; color: #aef; }
.fp-tester-btn.is-applied { border-color: #f7c948; color: #f7c948; }
.fp-tester-btn:disabled { opacity: 0.35; cursor: not-allowed; }
/* Tronc principal */
.fp-trunk {
    position: relative;
    margin-left: 12px;
    padding-left: 14px;
    padding-top: 6px;
    --row-h: 22px;
    --sub-x: 7px;
    --sym-size: 14px;
    --dot-v: repeating-linear-gradient(to bottom, #e8e4d4 0, #e8e4d4 2px, transparent 2px, transparent 5px);
    --dot-h: repeating-linear-gradient(to right, #e8e4d4 0, #e8e4d4 2px, transparent 2px, transparent 5px);
}
.fp-group {
    position: relative;
    margin-bottom: 2px;
}
.fp-group:not(:first-child) { margin-top: 4px; }
.fp-group::before {
    content: '';
    position: absolute;
    left: -14px;
    top: 0;
    width: 1px;
    height: calc(var(--row-h) / 2);
    background: var(--dot-v);
}
.fp-group:first-child::before {
    top: -6px;
    height: calc(6px + var(--row-h) / 2);
}
.fp-group:not(.fp-last)::after {
    content: '';
    position: absolute;
    left: -14px;
    top: calc(var(--row-h) / 2);
    bottom: 0;
    width: 1px;
    background: var(--dot-v);
}
.fp-node-row {
    display: flex;
    align-items: center;
    position: relative;
    height: var(--row-h);
}
.fp-node-row::before {
    content: '';
    position: absolute;
    left: -14px;
    top: 50%;
    width: 14px;
    height: 1px;
    background: var(--dot-h);
    transform: translateY(-0.5px);
}
.fp-group:has(.fp-children) .fp-node-row::after {
    content: '';
    position: absolute;
    left: var(--sub-x);
    top: 50%;
    bottom: 0;
    width: 1px;
    background: var(--dot-v);
}
.fp-group-symbol {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--sym-size);
    height: var(--sym-size);
    flex-shrink: 0;
    font-size: 0.6rem;
    line-height: 0;
    color: #e8e4d4;
    border: 1px solid rgba(232, 228, 212, 0.3);
    border-radius: 2px;
    position: relative;
    z-index: 1;
    background: #111;
    box-sizing: border-box;
}
.fp-group-text {
    font-size: 0.57rem;
    color: #888;
    white-space: nowrap;
    margin-left: 5px;
}
.fp-children {
    display: flex;
    flex-direction: column;
    margin-left: var(--sub-x);
    padding-left: 12px;
}
.fp-child-row {
    position: relative;
    padding: 1px 0;
}
.fp-child-row::before {
    content: '';
    position: absolute;
    left: -12px;
    top: 0;
    width: 1px;
    height: 50%;
    background: var(--dot-v);
}
.fp-child-row:not(:last-child)::before { height: 100%; }
.fp-child-row::after {
    content: '';
    position: absolute;
    left: -12px;
    top: 50%;
    width: 12px;
    height: 1px;
    background: var(--dot-h);
    transform: translateY(-0.5px);
}
/* ── Issue row ── */
.issue-status-row {
    display: flex; align-items: center; gap: 6px;
    padding: 2px 6px; font-size: 0.65rem;
    flex: 1; min-width: 0;
}
.issue-status-row.clickable { cursor: pointer; }
.issue-status-row.clickable:hover { background: var(--bg-hover, #1a1a1a); border-radius: 2px; }
.issue-status-row.is-selected { background: rgba(255,248,220,0.05); border-radius: 2px; }
.is-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.is-dot.is-patch-tests    { background: #4caf50; }
.is-dot.is-patch-no-tests { background: #f7c948; }
.is-dot.is-no-patch       { background: #555; }
.is-num  { color: cornsilk; flex-shrink: 0; }
.is-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #888; }
.is-badge { font-size: 0.58rem; flex-shrink: 0; padding: 1px 4px; border-radius: 3px; }
.is-badge.is-missing  { background: #2a2a2a; color: #555; }
.is-badge.is-notests  { background: rgba(247,201,72,0.15); color: #f7c948; }
.is-badge.is-ui-only  { background: #1a1a1a; color: #555; cursor: default; }
.is-duration {
    margin-left: auto;
    font-size: 0.48rem;
    font-family: 'JetBrains Mono', monospace;
    color: #2a4a2a;
    flex-shrink: 0;
}
.is-badge.is-stale    { background: rgba(255,152,0,0.15); color: #ff9800; }
.is-badge.is-ok       { background: rgba(76,175,80,0.15); color: #4caf50; }
.is-badge.is-btn      { border: none; cursor: pointer; }
.is-badge.is-btn:hover { filter: brightness(1.4); }
.is-reject-btn {
    background: none; border: none; cursor: pointer;
    color: inherit; font-size: 0.55rem; padding: 0 0 0 3px; line-height: 1;
}
.is-reject-btn:hover { color: #c8f5ca; }
.is-reprompt-btn {
    background: none; border: 1px solid rgba(76, 175, 80, 0.45); border-radius: 3px; cursor: pointer;
    color: #4caf50; font-size: 0.55rem; padding: 1px 4px; flex-shrink: 0;
    transition: color 0.1s, border-color 0.1s;
}
.is-reprompt-btn:hover { color: #c8f5ca; border-color: rgba(76, 175, 80, 0.75); }
.is-reprompt-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.is-in-badge {
    border: none; border-radius: 0; padding: 0 1px 0 3px; font-size: inherit;
}
.is-in-badge:hover { border: none; color: #c8f5ca; }
.sandbox-error {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px; font-size: 0.62rem; color: #f7c948;
    background: rgba(247,201,72,0.08); border-bottom: 1px solid rgba(247,201,72,0.2);
}
.sandbox-error span { flex: 1; }
.sandbox-error button {
    background: none; border: none; cursor: pointer; color: #f7c948; font-size: 0.7rem; padding: 0 2px;
}
.issue-status-footer { padding: 4px 8px; }
/* ── Boutons wf réutilisés dans l'arbre ── */
.wf-btn {
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
}
.wf-btn:disabled { opacity: 0.4; cursor: default; }
.wf-btn.wf-stale { color: #ff9800; border-color: rgba(255,152,0,0.3); }
.wf-btn.wf-stale:hover:not(:disabled) { color: #ffb74d; border-color: rgba(255,152,0,0.6); }
.wf-btn.wf-commit-all { color: #7ec8a0; border-color: rgba(126,200,160,0.3); }
.wf-btn.wf-commit-all:hover:not(:disabled) { color: #a8e6c4; border-color: rgba(126,200,160,0.6); }
.commit-all-status { padding: 4px 8px 2px; font-size: 11px; color: #888; }
.commit-all-status.is-error { color: #e07070; }
.commit-all-status.is-done { color: #7ec8a0; }
</style>
