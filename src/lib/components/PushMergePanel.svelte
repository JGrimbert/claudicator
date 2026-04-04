<script lang="ts">
import type { Task, IssueRow } from "$lib/types/task";

interface Props {
    task: Task;
    commitsAhead: { count: number; commits: { sha: string; message: string }[] } | null;
    pushing: boolean;
    merging: boolean;
    linkedIssueState: "open" | "closed" | null;
    closingIssue: boolean;
    closingIssues: boolean;
    issueRows: IssueRow[];
    spinnerFrame: string;
    onpush: () => void;
    onmerge: () => void;
    oncloseissue: () => void;
    oncloseissues: () => void;
}
let {
    task, commitsAhead, pushing, merging, linkedIssueState,
    closingIssue, closingIssues, issueRows, spinnerFrame,
    onpush, onmerge, oncloseissue, oncloseissues,
}: Props = $props();
</script>

<div class="push-panel">
    <span class="push-hint">
        {#if commitsAhead}
            <strong>{commitsAhead.count}</strong> commit{commitsAhead.count > 1 ? "s" : ""} sur <code>{task.branch}</code>
        {:else}
            Commits prêts sur <code>{task.branch}</code>
        {/if}
    </span>
    {#if commitsAhead?.commits.length}
        <div class="ahead-log">
            {#each commitsAhead.commits as c}
                <div class="ahead-row"><span class="ahead-sha">{c.sha}</span> <span class="ahead-msg">{c.message}</span></div>
            {/each}
        </div>
    {/if}
    <div class="push-actions">
        <button
            class="wf-btn"
            class:wf-active={!task.pushed && !pushing}
            class:wf-secondary={task.pushed}
            onclick={() => onpush()}
            disabled={pushing}
        >{pushing ? "…" : task.pushed ? "✓ Pushé" : "↑ Push"}</button>
        <button
            class="wf-btn"
            class:wf-active={task.pushed && !merging}
            class:wf-disabled={!task.pushed}
            class:merging-spin={merging}
            onclick={() => onmerge()}
            disabled={!task.pushed || merging}
        >{merging ? spinnerFrame : "⇒ Merge → main"}</button>
        {#if task.type === "fullplan" && task.fullPlanId && issueRows.length > 0}
            <button class="wf-btn close-issue-btn" onclick={() => oncloseissues()} disabled={closingIssues}>{closingIssues ? "…" : `✕ Fermer les ${issueRows.length} issues`}</button>
        {:else if task.issueNumber && linkedIssueState === "open"}
            <button class="wf-btn close-issue-btn" onclick={() => oncloseissue()} disabled={closingIssue} title="Fermer l'issue #{task.issueNumber} sur GitHub">{closingIssue ? "…" : "✕ Fermer #" + task.issueNumber}</button>
        {:else if task.issueNumber && linkedIssueState === "closed"}
            <span class="wf-btn wf-secondary" style="cursor:default">✓ Issue fermée</span>
        {/if}
    </div>
</div>

<style>
.push-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid #141414;
}
.push-hint {
    font-size: 0.65rem;
    color: #3a3a5a;
    font-style: italic;
}
.push-hint strong { color: #7ec8a0; font-style: normal; }
.push-hint code {
    font-family: 'JetBrains Mono', monospace;
    color: var(--text-muted);
    background: var(--bg-subtle);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
}
.ahead-log { display: flex; flex-direction: column; gap: 2px; }
.ahead-row { display: flex; gap: 0.5rem; font-size: 0.6rem; line-height: 1.4; }
.ahead-sha { color: #5a6a8a; font-family: 'JetBrains Mono', monospace; flex-shrink: 0; }
.ahead-msg { color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.push-actions { display: flex; gap: 0.5rem; }
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
    color: #555;
}
.wf-btn:disabled { opacity: 0.4; cursor: default; }
.wf-btn.wf-active { color: var(--accent-hover); border-color: transparent; background: none; }
.wf-btn.wf-active:hover { color: #b0a0ff; }
.wf-btn.wf-secondary { color: #444; border-color: transparent; cursor: pointer; }
.wf-btn.wf-secondary:hover { color: #777; border-color: #333; }
.wf-btn.wf-disabled { color: #333; border-color: transparent; cursor: default; pointer-events: none; }
.close-issue-btn { color: #a04040 !important; border-color: #3a2a2a !important; }
.close-issue-btn:hover:not(:disabled) { color: #f44336 !important; border-color: #f44336 !important; }
.merging-spin { color: cornsilk !important; }
</style>
