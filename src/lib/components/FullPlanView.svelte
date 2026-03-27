<script lang="ts">
    import { JgrPre, JgrCta } from "jgr-ui";
    import type { ActiveFullPlan } from "$lib/stores/agent";
    import { agentRunState, startConsoleStream } from "$lib/stores/agent";

    let { plan }: { plan: ActiveFullPlan } = $props();
    let content = $state("");
    let loadError = $state("");

    // Mode édition
    let editing = $state(false);
    let editText = $state("");
    let saving = $state(false);

    // Agrandir/réduire
    let expanded = $state(false);

    // Lancement implémentation
    let launching = $state(false);
    let launchingStack = $state<string | null>(null);

    function parseStacks(text: string): string[] {
        const re = /^## Stack "([^"]+)"/gm;
        const out: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) out.push(m[1]);
        return out;
    }

    const stacks = $derived(content ? parseStacks(content) : []);

    $effect(() => {
        if (plan.status === "done" && plan.planFile && plan.id) {
            content = "";
            loadError = "";
            editing = false;
            fetch(`/api/issues/groups/full-plans/${plan.id}/content`)
                .then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.text();
                })
                .then(t => { content = t; })
                .catch(e => { loadError = e.message; });
        }
    });

    function startEdit() {
        editText = content;
        editing = true;
    }

    function cancelEdit() {
        editing = false;
        editText = "";
    }

    async function savePlan() {
        if (!plan.id || !editText.trim()) return;
        saving = true;
        try {
            const res = await fetch(`/api/issues/groups/full-plans/${plan.id}/content`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: editText }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            content = editText;
            editing = false;
        } catch (e: any) {
            loadError = e.message;
        } finally {
            saving = false;
        }
    }

    async function launchImpl(stackKeyword?: string) {
        if (!plan.id) return;
        if (stackKeyword ? launchingStack === stackKeyword : launching) return;
        if (stackKeyword) launchingStack = stackKeyword; else launching = true;
        agentRunState.update(s => ({
            ...s,
            taskId: plan.id,
            taskTitle: stackKeyword ? `Implémentation — ${plan.keyword} / ${stackKeyword}` : `Implémentation — ${plan.keyword}`,
            logs: [],
            running: true,
            sessionAlive: false,
        }));
        try {
            const body = stackKeyword ? JSON.stringify({ stackKeyword }) : undefined;
            const res = await fetch(`/api/issues/groups/full-plans/${plan.id}/run`, {
                method: "POST",
                headers: body ? { "Content-Type": "application/json" } : {},
                body,
            });
            await startConsoleStream(res, { onDone: () => { if (stackKeyword) launchingStack = null; else launching = false; } });
        } catch (e: any) {
            agentRunState.update(s => ({
                ...s,
                running: false,
                logs: [...s.logs, { line: `[erreur] ${e.message}`, type: "system" }],
            }));
            if (stackKeyword) launchingStack = null; else launching = false;
        }
    }
</script>

<div class="fp-wrap">
    {#if plan.status === "generating"}
        <div class="fp-state fp-generating">
            <span class="fp-spinner"></span>
            <span>Génération en cours — {plan.keyword}…</span>
        </div>
    {:else if plan.status === "error"}
        <div class="fp-state fp-error">
            Erreur — le plan complet n'a pas été généré correctement.
        </div>
    {:else if loadError}
        <div class="fp-state fp-error">{loadError}</div>
    {:else if content}
        {#if editing}
            <div class="fp-edit-wrap">
                <textarea
                    class="fp-edit-ta"
                    bind:value={editText}
                    disabled={saving}
                ></textarea>
                <div class="fp-edit-actions">
                    <button class="fp-save-btn" onclick={savePlan} disabled={saving || !editText.trim()}>
                        {saving ? "…" : "✓ Sauvegarder"}
                    </button>
                    <button class="fp-cancel-btn" onclick={cancelEdit} disabled={saving}>
                        ✕ Annuler
                    </button>
                </div>
            </div>
        {:else}
            <div class="fp-plan-row">
                <div class="fp-plan-content">
                    <JgrPre {content} previewLines={8} maxHeight={expanded ? undefined : "20rem"} />
                </div>
                <button class="fp-edit-btn" onclick={startEdit} title="Modifier">✎</button>
            </div>
            <div class="fp-expand-row">
                <button class="fp-expand-link" onclick={() => { expanded = !expanded; }}>
                    {expanded ? "↑ Réduire" : "↕ Agrandir"}
                </button>
            </div>
            <div class="fp-actions">
                {#if stacks.length > 0}
                    <div class="fp-stacks">
                        {#each stacks as kw}
                            <button
                                class="fp-stack-btn"
                                onclick={() => launchImpl(kw)}
                                disabled={launchingStack === kw || launching}
                            >
                                {launchingStack === kw ? "…" : "▶"} {kw}
                            </button>
                        {/each}
                    </div>
                    <div class="fp-actions-sep"></div>
                {/if}
                <JgrCta label="Lancer tout" pending={launching} onclick={() => launchImpl()} />
            </div>
        {/if}
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
    .fp-spinner::before {
        content: "⠋";
        font-family: monospace;
        animation: spin-braille 0.8s steps(8, end) infinite;
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
    .fp-plan-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 12px 16px 0;
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }
    .fp-plan-content {
        flex: 1;
        min-width: 0;
        overflow: hidden;
    }
    .fp-edit-btn {
        flex-shrink: 0;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 16px;
        color: var(--color-text-muted, #888);
        padding: 2px 4px;
        line-height: 1;
    }
    .fp-edit-btn:hover {
        color: var(--color-text, #ccc);
    }
    .fp-expand-row {
        display: flex;
        justify-content: flex-end;
        padding: 4px 16px;
    }
    .fp-expand-link {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 11px;
        color: var(--color-text-muted, #888);
        padding: 0;
    }
    .fp-expand-link:hover {
        color: var(--color-text, #ccc);
    }
    .fp-actions {
        padding: 12px 16px;
        border-top: 1px solid var(--color-border, #333);
        margin-top: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .fp-stacks {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .fp-stack-btn {
        padding: 4px 10px;
        font-size: 11px;
        border-radius: 4px;
        cursor: pointer;
        border: 1px solid var(--color-border, #333);
        background: var(--color-bg-subtle, #1a1a2e);
        color: var(--color-text, #ccc);
        white-space: nowrap;
    }
    .fp-stack-btn:hover:not(:disabled) {
        border-color: #6a50c0;
        color: #a78bfa;
    }
    .fp-stack-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .fp-actions-sep {
        height: 1px;
        background: var(--color-border, #333);
    }
    .fp-edit-wrap {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        padding: 12px 16px;
        gap: 8px;
    }
    .fp-edit-ta {
        flex: 1;
        min-height: 0;
        resize: none;
        font-family: monospace;
        font-size: 12px;
        line-height: 1.5;
        background: var(--color-bg-input, #1a1a1a);
        color: var(--color-text, #ccc);
        border: 1px solid var(--color-border, #333);
        border-radius: 4px;
        padding: 8px;
    }
    .fp-edit-actions {
        display: flex;
        gap: 8px;
    }
    .fp-save-btn, .fp-cancel-btn {
        padding: 4px 12px;
        font-size: 12px;
        border-radius: 4px;
        cursor: pointer;
        border: 1px solid var(--color-border, #333);
    }
    .fp-save-btn {
        background: var(--color-accent, #2563eb);
        color: #fff;
    }
    .fp-save-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .fp-cancel-btn {
        background: transparent;
        color: var(--color-text-muted, #888);
    }
</style>
