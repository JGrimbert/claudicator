<script lang="ts">
import DiffView from "../viewers/DiffView.svelte";

interface Props {
    diffContent: string | null;
    diffLoading: boolean;
    commitMsg: string;
    committing: boolean;
    reverting: boolean;
    revertConfirm: boolean;
    oncommitmsgchange: (msg: string) => void;
    oncommit: () => void;
    onrevert: () => void;
    onreloaddiff: () => void;
}
let {
    diffContent, diffLoading, commitMsg, committing, reverting, revertConfirm,
    oncommitmsgchange, oncommit, onrevert, onreloaddiff,
}: Props = $props();
</script>

<div class="commit-panel">
    <div class="commit-bar">
        <input
            class="commit-msg-input"
            placeholder="Message de commit…"
            value={commitMsg}
            disabled={committing}
            oninput={(e) => oncommitmsgchange((e.target as HTMLInputElement).value)}
        />
        <button class="commit-btn" onclick={() => oncommit()} disabled={!commitMsg.trim() || committing}>{committing ? "…" : "✓ Commiter"}</button>
        <button class="revert-btn" onclick={() => onrevert()} disabled={reverting}>{reverting ? "…" : revertConfirm ? "Confirmer ?" : "✕ Annuler"}</button>
        <button class="diff-refresh-btn" onclick={() => onreloaddiff()} title="Rafraîchir">↺</button>
    </div>
    <DiffView content={diffContent ?? ""} loading={diffLoading} loadingText="Chargement du diff…" emptyText="Aucune modification non commitée" />
</div>

<style>
.commit-panel { display: flex; flex-direction: column; border-top: 1px solid var(--border); }
.commit-bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}
.commit-msg-input {
    flex: 1;
    min-width: 0;
    background: var(--bg-deep);
    border: 1px solid var(--border-strong);
    border-radius: 3px;
    color: #888;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.63rem;
    padding: 0.25rem 0.5rem;
    outline: none;
}
.commit-msg-input:focus { border-color: #4caf50; color: #bbb; }
.commit-msg-input::placeholder { color: var(--border-strong); }
.commit-msg-input:disabled { opacity: 0.4; }
.commit-btn {
    background: none;
    border: 1px solid #2a4a2a;
    color: #4caf50;
    font-size: 0.62rem;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
}
.commit-btn:hover:not(:disabled) { border-color: #4caf50; }
.commit-btn:disabled { opacity: 0.35; cursor: default; }
.revert-btn {
    background: none;
    border: 1px solid var(--border-strong);
    color: #555;
    font-size: 0.6rem;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
}
.revert-btn:hover:not(:disabled) { color: #f44336; border-color: #f44336; }
.revert-btn:disabled { opacity: 0.35; cursor: default; }
.diff-refresh-btn {
    background: none;
    border: none;
    color: #2a2a3a;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    flex-shrink: 0;
}
.diff-refresh-btn:hover { color: #555; }
</style>
