<script lang="ts">
interface Props {
    content: string;
    loading?: boolean;
    loadingText?: string;
    emptyText?: string;
}
let { content, loading = false, loadingText = "Chargement…", emptyText = "Aucune modification" }: Props = $props();
</script>

{#if loading}
    <span class="diff-hint">{loadingText}</span>
{:else if content.trim()}
    <div class="diff-view">
        {#each content.split('\n') as line}
            <div
                class="diff-line"
                class:add={line.startsWith('+') && !line.startsWith('+++')}
                class:del={line.startsWith('-') && !line.startsWith('---')}
                class:hunk={line.startsWith('@@')}
                class:meta={line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')}
            >{line || '\u200b'}</div>
        {/each}
    </div>
{:else if content !== null}
    <span class="diff-hint">{emptyText}</span>
{/if}

<style>
.diff-view {
    max-height: 320px;
    overflow-y: auto;
    padding: 0.4rem 0;
    background: var(--bg-deep);
}
.diff-view::-webkit-scrollbar { width: 3px; }
.diff-view::-webkit-scrollbar-thumb { background: var(--border); }
.diff-line {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.63rem;
    line-height: 1.5;
    padding: 0 1rem;
    white-space: pre;
    overflow-x: hidden;
    text-overflow: ellipsis;
    color: #555;
}
.diff-line.add { color: #4caf50; background: rgba(76,175,80,0.05); }
.diff-line.del { color: #f44336; background: rgba(244,67,54,0.05); }
.diff-line.hunk { color: #7c6af7; }
.diff-line.meta { color: #2a2a2a; }
.diff-hint {
    display: block;
    padding: 0.4rem 1rem;
    font-size: 0.62rem;
    color: #333;
    font-style: italic;
}
</style>
