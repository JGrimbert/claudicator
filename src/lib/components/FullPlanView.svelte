<script lang="ts">
    import { JgrPre, JgrCta } from "jgr-ui";
    import type { ActiveFullPlan } from "$lib/stores/agent";
    import { agentRunState, activeFullPlan, startConsoleStream, consoleTab } from "$lib/stores/agent";

    let { plan }: { plan: ActiveFullPlan } = $props();
    let content = $state("");
    let loadError = $state("");

    // Mode édition
    let editing = $state(false);
    let editText = $state("");
    let saving = $state(false);

    // Agrandir/réduire
    let expanded = $state(false);

    // Suppression
    let confirmingDelete = $state(false);
    let deleting = $state(false);

    // Lancement implémentation
    let launching = $state(false);
    let launchingStack = $state<string | null>(null);

    // Nouveau cycle
    let launchingNewCycle = $state(false);

    // Étapes détaillées
    let stepFiles = $state<{ filename: string; issues: number[] }[]>([]);
    let selectedStep = $state<string | null>(null);
    let stepContent = $state("");
    let stepLoading = $state(false);

    // DAG
    let dagLevels = $state<{ level: number; issues: number[]; stacks: string[] }[]>([]);
    let dagRunning = $state(false);
    let dagCurrentRow = $state<number | null>(null);
    let dagStackStatus = $state<Record<string, "running" | "done" | "error">>({});

    /** Compte les issues résiduelles depuis le contenu du plan */
    function parseResidualCount(text: string): number {
        const start = text.search(/^## Résiduel/m);
        if (start === -1) return 0;
        // Extraire jusqu'au prochain ## heading (ou fin du texte)
        const afterTitle = text.indexOf("\n", start) + 1;
        const rest = text.slice(afterTitle);
        const nextHeading = rest.search(/^## /m);
        const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
        // Compter les références #NNN dans les tables (| #NNN) ou listes (- #NNN)
        return (section.match(/[|\-]\s*#\d+/g) ?? []).length;
    }

    const residualCount = $derived(content ? parseResidualCount(content) : 0);

    function parseStacks(text: string): string[] {
        const re = /^## Stack "([^"]+)"/gm;
        const out: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) out.push(m[1]);
        return out;
    }

    const stacks = $derived(content ? parseStacks(content) : []);

    $effect(() => {
        if (plan.status === "done" && plan.id && plan.keyword) {
            dagLevels = [];
            dagStackStatus = {};
            dagCurrentRow = null;
            dagRunning = false;
            fetch(`/api/issues/groups/eval-dag/${plan.keyword}?planId=${plan.id}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (data?.exists && data.levels?.length > 1) dagLevels = data.levels;
                })
                .catch(() => {});
        }
    });

    $effect(() => {
        if (plan.status === "done" && plan.planFile && plan.id) {
            content = "";
            loadError = "";
            editing = false;
            selectedStep = null;
            stepFiles = [];
            fetch(`/api/issues/groups/full-plans/${plan.id}/content`)
                .then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.text();
                })
                .then(t => { content = t; })
                .catch(e => { loadError = e.message; });
            // Charger la liste des étapes
            fetch(`/api/issues/groups/full-plans/${plan.id}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => { if (data?.stepFiles?.length) stepFiles = data.stepFiles; })
                .catch(() => {});
        }
    });

    async function viewStep(filename: string) {
        selectedStep = filename;
        stepContent = "";
        stepLoading = true;
        try {
            const r = await fetch(`/api/issues/groups/full-plans/${plan.id}/steps/${filename}`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            stepContent = await r.text();
        } catch (e: any) {
            stepContent = `Erreur : ${e.message}`;
        } finally {
            stepLoading = false;
        }
    }

    function startEdit() {
        confirmingDelete = false;
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

    async function launchNewCycle() {
        if (launchingNewCycle || !plan.id) return;
        launchingNewCycle = true;

        try {
            // Récupérer les données complètes du plan (subStacks + residualIssues)
            const planData = await fetch(`/api/issues/groups/full-plans/${plan.id}`)
                .then(r => r.ok ? r.json() : Promise.reject(r.status));

            const residuals: { number: number; title: string }[] = planData.residualIssues ?? [];
            if (!residuals.length) { launchingNewCycle = false; return; }

            // Répartir les résiduels dans les stacks d'origine si leurs issues y correspondent,
            // sinon regrouper en stack "suite"
            const originalStacks: { keyword: string; issues: { number: number; title: string }[] }[] =
                planData.subStacks ?? [];
            const assignedNums = new Set(originalStacks.flatMap((s: any) => s.issues.map((i: any) => i.number)));

            // Stacks reconstruites : seulement les résiduels (pas les issues déjà planifiées)
            const newStacks: { keyword: string; issues: { number: number; title: string }[] }[] = [];
            for (const s of originalStacks) {
                const matching = residuals.filter(r => !assignedNums.has(r.number));
                if (matching.length) {
                    // Cherche si des résiduels "appartiennent" à cette stack par leur titre
                    const keyword = s.keyword.toLowerCase();
                    const forStack = matching.filter(r => r.title.toLowerCase().includes(keyword));
                    if (forStack.length) newStacks.push({ keyword: s.keyword, issues: forStack });
                }
            }
            // Le reste va dans une stack "suite"
            const assigned = new Set(newStacks.flatMap(s => s.issues.map(i => i.number)));
            const unassigned = residuals.filter(r => !assigned.has(r.number));
            if (unassigned.length) newStacks.push({ keyword: "suite", issues: unassigned });

            if (!newStacks.length) { launchingNewCycle = false; return; }

            // Lancer l'analyse
            activeFullPlan.set({ id: "", keyword: plan.keyword, status: "generating", taskId: plan.taskId });
            agentRunState.update(s => ({
                ...s, running: true, logs: [], taskId: plan.taskId ?? null,
                taskTitle: `Plan complet — ${plan.keyword} (cycle suivant)`,
            }));
            consoleTab.set("console");

            const r = await fetch("/api/issues/groups/stack-plan-full", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupKeyword: plan.keyword, subStacks: newStacks, residualIssues: [], existingTaskId: plan.taskId }),
            });

            await startConsoleStream(r, {
                onEvent: (event: any) => {
                    if (event.type === "system" && event.line === "[planId]" && event.planId)
                        activeFullPlan.update(s => s ? { ...s, id: event.planId } : s);
                    if (event.type === "system" && event.line === "[done]" && event.planFile)
                        activeFullPlan.update(s => s ? { ...s, status: "done", planFile: event.planFile } : s);
                },
                onDone: () => { launchingNewCycle = false; }
            });
        } catch (e: any) {
            agentRunState.update(s => ({ ...s, running: false }));
            launchingNewCycle = false;
        }
    }

    async function runStackRaw(stackKeyword: string): Promise<void> {
        const res = await fetch(`/api/issues/groups/full-plans/${plan.id}/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stackKeyword }),
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        try {
            while (true) {
                const { done } = await reader.read();
                if (done) break;
            }
        } finally {
            reader.releaseLock();
        }
    }

    async function launchDagRow(level: number): Promise<void> {
        if (dagRunning || launching || launchingStack !== null || !plan.id) return;
        const row = dagLevels.find(r => r.level === level);
        if (!row?.stacks.length) return;
        dagRunning = true;
        dagCurrentRow = level;
        for (const kw of row.stacks) dagStackStatus[kw] = "running";
        try {
            await Promise.all(row.stacks.map(async (kw) => {
                try {
                    await runStackRaw(kw);
                    dagStackStatus[kw] = "done";
                } catch {
                    dagStackStatus[kw] = "error";
                }
            }));
        } finally {
            dagRunning = false;
            dagCurrentRow = null;
        }
    }

    async function launchDagRows(): Promise<void> {
        if (dagRunning || launching || launchingStack !== null || !plan.id || !dagLevels.length) return;
        dagRunning = true;
        try {
            for (let i = 0; i < dagLevels.length; i++) {
                dagCurrentRow = i;
                const row = dagLevels[i];
                for (const kw of row.stacks) dagStackStatus[kw] = "running";
                let rowFailed = false;
                await Promise.all(row.stacks.map(async (kw) => {
                    try {
                        await runStackRaw(kw);
                        dagStackStatus[kw] = "done";
                    } catch {
                        dagStackStatus[kw] = "error";
                        rowFailed = true;
                    }
                }));
                if (rowFailed) break;
            }
        } finally {
            dagRunning = false;
            dagCurrentRow = null;
        }
    }

    function isRowLocked(level: number): boolean {
        if (level === 0) return false;
        for (let i = 0; i < level; i++) {
            const row = dagLevels[i];
            if (row.stacks.some(kw => dagStackStatus[kw] !== "done")) return true;
        }
        return false;
    }

    async function deletePlan() {
        if (!plan.id) return;
        if (!confirmingDelete) { confirmingDelete = true; return; }
        deleting = true;
        try {
            await fetch(`/api/issues/groups/full-plans/${plan.id}`, { method: "DELETE" });
            activeFullPlan.set(null);
        } catch (e: any) {
            loadError = e.message;
            deleting = false;
            confirmingDelete = false;
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
        {:else if selectedStep}
            <div class="fp-step-header">
                <button class="fp-back-btn" onclick={() => { selectedStep = null; stepContent = ""; }}>← Plan global</button>
                <span class="fp-step-title">{selectedStep}</span>
            </div>
            <div class="fp-plan-content fp-step-content">
                {#if stepLoading}
                    <div class="fp-state">Chargement…</div>
                {:else}
                    <JgrPre content={stepContent} previewLines={12} maxHeight={expanded ? undefined : "30rem"} />
                {/if}
            </div>
            <div class="fp-expand-row">
                <button class="fp-expand-link" onclick={() => { expanded = !expanded; }}>
                    {expanded ? "↑ Réduire" : "↕ Agrandir"}
                </button>
            </div>
        {:else}
            <div class="fp-plan-row">
                <div class="fp-plan-content">
                    <JgrPre {content} previewLines={8} maxHeight={expanded ? undefined : "20rem"} />
                </div>
                <button class="fp-edit-btn" onclick={startEdit} title="Modifier">✎</button>
                <button
                    class="fp-delete-btn"
                    class:fp-delete-confirm={confirmingDelete}
                    onclick={deletePlan}
                    disabled={deleting || launching || launchingStack !== null}
                    title={confirmingDelete ? "Confirmer la suppression" : "Supprimer ce plan"}
                >
                    {deleting ? "…" : confirmingDelete ? "Confirmer ✕" : "✕"}
                </button>
            </div>
            <div class="fp-expand-row">
                <button class="fp-expand-link" onclick={() => { expanded = !expanded; }}>
                    {expanded ? "↑ Réduire" : "↕ Agrandir"}
                </button>
            </div>
            {#if stepFiles.length > 0}
                <div class="fp-steps-list">
                    <span class="fp-steps-title">Étapes ({stepFiles.length})</span>
                    <div class="fp-steps-btns">
                        {#each stepFiles as sf, i}
                            <button class="fp-step-btn" onclick={() => viewStep(sf.filename)}>
                                Étape {i + 1}
                                {#if sf.issues.length}
                                    <span class="fp-step-issues">{sf.issues.map(n => `#${n}`).join(", ")}</span>
                                {/if}
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="fp-actions-sep"></div>
            {/if}
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
                {#if residualCount > 0 && !stepFiles.length}
                    <button
                        class="fp-newcycle-btn"
                        onclick={launchNewCycle}
                        disabled={launchingNewCycle || launching || launchingStack !== null}
                        title="Relancer l'analyse pour les {residualCount} issues résiduelles"
                    >
                        {launchingNewCycle ? "…" : `↻ Nouveau cycle (${residualCount} issues)`}
                    </button>
                {/if}
                {#if dagLevels.length > 0}
                    <div class="fp-actions-sep"></div>
                    <div class="fp-dag-header">
                        <span class="fp-dag-title">Ordre DAG</span>
                        <button
                            class="fp-stack-btn"
                            onclick={launchDagRows}
                            disabled={dagRunning || launching || launchingStack !== null}
                        >
                            {dagRunning ? "…" : "▶▶"} Tout DAG
                        </button>
                    </div>
                    {#each dagLevels as row}
                        <div class="fp-dag-row" class:fp-dag-active={dagCurrentRow === row.level}>
                            <div class="fp-dag-row-info">
                                <span class="fp-dag-row-lbl">Row {row.level}</span>
                                <span class="fp-dag-row-nums">{row.issues.map(n => `#${n}`).join(" ")}</span>
                            </div>
                            <div class="fp-dag-row-right">
                                {#each row.stacks as kw}
                                    <span class="fp-dag-badge fp-dag-badge-{dagStackStatus[kw] ?? 'idle'}">
                                        {kw}{#if dagStackStatus[kw] === "running"} ⠋{:else if dagStackStatus[kw] === "done"} ✓{:else if dagStackStatus[kw] === "error"} ✗{/if}
                                    </span>
                                {/each}
                                <button
                                    class="fp-stack-btn"
                                    onclick={() => launchDagRow(row.level)}
                                    disabled={dagRunning || launching || launchingStack !== null || isRowLocked(row.level)}
                                >
                                    {dagCurrentRow === row.level ? "…" : "▶"} Row {row.level}
                                </button>
                            </div>
                        </div>
                    {/each}
                {/if}
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
    .fp-delete-btn {
        flex-shrink: 0;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 13px;
        color: var(--color-text-muted, #888);
        padding: 2px 4px;
        line-height: 1;
        border-radius: 3px;
        white-space: nowrap;
    }
    .fp-delete-btn:hover:not(:disabled) {
        color: #f87171;
    }
    .fp-delete-btn.fp-delete-confirm {
        color: #f87171;
        font-size: 11px;
        border: 1px solid #dc2626;
        padding: 2px 6px;
    }
    .fp-delete-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
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
    .fp-newcycle-btn {
        align-self: flex-start;
        padding: 4px 10px;
        font-size: 11px;
        border-radius: 4px;
        cursor: pointer;
        border: 1px dashed var(--color-border, #555);
        background: transparent;
        color: var(--color-text-muted, #888);
        margin-top: 2px;
    }
    .fp-newcycle-btn:hover:not(:disabled) {
        border-color: #a78bfa;
        color: #a78bfa;
    }
    .fp-newcycle-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .fp-dag-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }
    .fp-dag-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--color-text-muted, #888);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .fp-dag-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 6px 8px;
        border-radius: 4px;
        border: 1px solid var(--color-border, #333);
        background: transparent;
        transition: border-color 0.15s;
    }
    .fp-dag-row.fp-dag-active {
        border-color: #6a50c0;
    }
    .fp-dag-row-info {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .fp-dag-row-lbl {
        font-size: 11px;
        font-weight: 600;
        color: var(--color-text, #ccc);
        white-space: nowrap;
    }
    .fp-dag-row-nums {
        font-size: 11px;
        color: var(--color-text-muted, #888);
        font-family: monospace;
    }
    .fp-dag-row-right {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
    }
    .fp-dag-badge {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 3px;
        border: 1px solid var(--color-border, #444);
        color: var(--color-text-muted, #888);
        white-space: nowrap;
    }
    .fp-dag-badge-running {
        border-color: #6a50c0;
        color: #a78bfa;
    }
    .fp-dag-badge-done {
        border-color: #16a34a;
        color: #4ade80;
    }
    .fp-dag-badge-error {
        border-color: #dc2626;
        color: #f87171;
    }
    .fp-step-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 16px;
        border-bottom: 1px solid var(--color-border, #333);
    }
    .fp-back-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 12px;
        color: var(--color-accent, #7c6af7);
        padding: 0;
    }
    .fp-back-btn:hover { text-decoration: underline; }
    .fp-step-title {
        font-size: 12px;
        color: var(--color-text-muted, #888);
        font-family: monospace;
    }
    .fp-step-content {
        padding: 12px 16px;
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }
    .fp-steps-list {
        padding: 8px 16px 4px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .fp-steps-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--color-text-muted, #888);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .fp-steps-btns {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }
    .fp-step-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 3px 8px;
        font-size: 11px;
        border-radius: 4px;
        cursor: pointer;
        border: 1px solid var(--color-border, #333);
        background: var(--color-bg-subtle, #1a1a2e);
        color: var(--color-text, #ccc);
        white-space: nowrap;
    }
    .fp-step-btn:hover {
        border-color: #7c6af7;
        color: #a78bfa;
    }
    .fp-step-issues {
        font-family: monospace;
        font-size: 10px;
        color: var(--color-text-muted, #888);
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
