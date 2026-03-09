<script lang="ts">
    import { afterUpdate, onMount, onDestroy } from "svelte";
    import { issueAnalysis, agentRunState } from "$lib/stores/agent";

    const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frame = 0;
    let spinnerInterval: ReturnType<typeof setInterval> | null = null;

    let logArea: HTMLDivElement;
    let autoScroll = true;
    let mermaidDiv: HTMLDivElement | null = null;
    let mermaidRendered = false;
    let createLoading = false;
    let createFeedback = "";

    onMount(() => {
        spinnerInterval = setInterval(() => { frame = (frame + 1) % FRAMES.length; }, 80);
        loadResult();
    });
    onDestroy(() => { if (spinnerInterval) clearInterval(spinnerInterval); });

    afterUpdate(() => {
        if (autoScroll && logArea) logArea.scrollTop = logArea.scrollHeight;
        if ($issueAnalysis.result && mermaidDiv && !mermaidRendered) {
            renderMermaid();
        }
    });

    function onScroll() {
        if (!logArea) return;
        const atBottom = logArea.scrollHeight - logArea.scrollTop - logArea.clientHeight < 40;
        autoScroll = atBottom;
    }

    // Charger le résultat existant depuis le serveur au montage
    async function loadResult() {
        if ($issueAnalysis.result) return;
        try {
            const r = await fetch("/api/issues/analysis");
            if (r.ok) {
                const text = await r.text();
                if (text.trim()) issueAnalysis.update(s => ({ ...s, result: text }));
            }
        } catch { /* silencieux */ }
    }

    // Extraire le bloc mermaid du résultat
    function extractMermaid(text: string): string | null {
        const match = text.match(/```mermaid\s*([\s\S]*?)```/);
        return match ? match[1].trim() : null;
    }

    // Rendre le texte sans le bloc mermaid (pour affichage dans <pre>)
    function textWithoutMermaid(text: string): string {
        return text.replace(/```mermaid[\s\S]*?```/g, "[Diagramme Mermaid ci-dessous]");
    }

    async function renderMermaid() {
        const mermaidCode = extractMermaid($issueAnalysis.result ?? "");
        if (!mermaidCode || !mermaidDiv) return;
        mermaidRendered = true;
        try {
            // Charger mermaid dynamiquement depuis CDN si absent
            let mermaid: any = (window as any).mermaid;
            if (!mermaid) {
                await new Promise<void>((resolve, reject) => {
                    const s = document.createElement("script");
                    s.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
                    s.onload = () => resolve();
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
                mermaid = (window as any).mermaid;
                mermaid.initialize({ startOnLoad: false, theme: "dark" });
            }
            const { svg } = await mermaid.render("analysis-diagram", mermaidCode);
            if (mermaidDiv) mermaidDiv.innerHTML = svg;
        } catch {
            mermaidRendered = false;
            if (mermaidDiv) mermaidDiv.innerHTML = `<pre class="mermaid-fallback">${mermaidCode}</pre>`;
        }
    }

    function dismiss() {
        issueAnalysis.update(s => ({ ...s, result: null, logs: [], running: false, snapshotDiff: null }));
        mermaidRendered = false;
        createFeedback = "";
    }

    // Créer les tasks depuis les issues analysées
    async function createTasks() {
        if (createLoading) return;
        createLoading = true;
        createFeedback = "";
        try {
            const snap = await fetch("/api/issues/snapshot");
            if (!snap.ok) { createFeedback = "Snapshot introuvable"; return; }
            const { snapshot } = await snap.json();
            if (!snapshot?.length) { createFeedback = "Aucune issue dans la snapshot"; return; }

            let created = 0;
            let existing = 0;
            await Promise.all(snapshot.map(async (issue: { number: number; title: string }) => {
                const r = await fetch("/api/tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: issue.title, issueNumber: issue.number })
                });
                if (r.ok) {
                    const data = await r.json();
                    // Si l'id retourné existait déjà, la task existait
                    data.alreadyExisted ? existing++ : created++;
                } else {
                    existing++;
                }
            }));
            createFeedback = `${created} task${created > 1 ? "s" : ""} créée${created > 1 ? "s" : ""}${existing > 0 ? `, ${existing} existaient déjà` : ""}`;
        } catch (e: any) {
            createFeedback = e.message ?? "Erreur";
        } finally {
            createLoading = false;
        }
    }

    $: visibleLogs = $issueAnalysis.logs.filter(l => l.type !== "usage" && !/^\[pid:\d+\]$/.test(l.line));
    $: systemLogs  = $issueAnalysis.logs.filter(l => l.type === "system" && !/^\[pid:\d+\]$/.test(l.line));
    $: lastStatus  = systemLogs.length > 0 ? systemLogs[systemLogs.length - 1].line : "";
    $: issueCount  = 0; // sera mis à jour via snapshot
</script>

<div class="analysis">
    <div class="analysis-header">
        <span class="dot" class:running={$issueAnalysis.running}></span>
        <span class="label">Analyse des issues</span>
        {#if !$issueAnalysis.running}
            <button class="btn-dismiss" onclick={dismiss}>✕ Fermer</button>
        {/if}
    </div>

    {#if $issueAnalysis.running}
        <!-- Console de logs temps réel -->
        <div class="log-area" bind:this={logArea} onscroll={onScroll}>
            {#if visibleLogs.length === 0}
                <span class="hint blink">{FRAMES[frame]} Initialisation de l'analyse…</span>
            {:else}
                {#each visibleLogs as entry}
                    <div class="log-line" class:sys={entry.type === "system"}>{entry.line}</div>
                {/each}
            {/if}
        </div>
        {#if lastStatus}
            <div class="status-bar">{FRAMES[frame]} {lastStatus}</div>
        {/if}

    {:else if $issueAnalysis.result}
        <!-- Résultat affiché -->
        <div class="result-area">
            <pre class="result-text">{textWithoutMermaid($issueAnalysis.result)}</pre>

            {#if extractMermaid($issueAnalysis.result)}
                <div class="mermaid-section">
                    <div class="mermaid-label">Roadmap</div>
                    <div class="mermaid-container" bind:this={mermaidDiv}>
                        <span class="hint">{FRAMES[frame]} Rendu du diagramme…</span>
                    </div>
                </div>
            {/if}
        </div>

        <div class="action-bar">
            {#if createFeedback}
                <span class="feedback">{createFeedback}</span>
            {/if}
            <button class="btn-tasks" onclick={createTasks} disabled={createLoading}>
                {createLoading ? "Création…" : "Créer les tasks"}
            </button>
        </div>

    {:else}
        <div class="empty">
            <span class="hint">Aucune analyse disponible. Cliquez sur "Analyser" dans la liste des issues.</span>
        </div>
    {/if}
</div>

<style>
.analysis {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #05050f;
    font-family: 'JetBrains Mono', monospace;
}
.analysis-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 1rem;
    border-bottom: 1px solid #1a1a2a;
    flex-shrink: 0;
    background: #07070f;
}
.dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #333;
    flex-shrink: 0;
    transition: background 0.3s;
}
.dot.running {
    background: #7c6af7;
    animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.label {
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #555;
    flex: 1;
}
.btn-dismiss {
    background: none;
    border: 1px solid #1e1e1e;
    color: #333;
    font-size: 0.62rem;
    padding: 0.15rem 0.55rem;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace;
}
.btn-dismiss:hover { border-color: #555; color: #777; }
.log-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.6rem 1.2rem;
}
.log-area::-webkit-scrollbar { width: 4px; }
.log-area::-webkit-scrollbar-track { background: transparent; }
.log-area::-webkit-scrollbar-thumb { background: #1e1e2e; border-radius: 2px; }
.log-line {
    font-size: 0.7rem;
    color: #aaa;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
}
.log-line.sys { color: #3a3a5a; font-style: italic; }
.hint {
    display: block;
    padding: 0.4rem 0;
    color: #2a2a3a;
    font-size: 0.68rem;
    font-style: italic;
}
.blink { animation: blink 1.2s step-start infinite; }
@keyframes blink { 50% { opacity: 0.3; } }
.status-bar {
    padding: 0.3rem 1.2rem;
    border-top: 1px solid #1a1a2a;
    font-size: 0.6rem;
    color: #4a9eff;
    background: #07070f;
    flex-shrink: 0;
    font-style: italic;
    opacity: 0.75;
}
.result-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.8rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
.result-area::-webkit-scrollbar { width: 4px; }
.result-area::-webkit-scrollbar-track { background: transparent; }
.result-area::-webkit-scrollbar-thumb { background: #1e1e2e; border-radius: 2px; }
.result-text {
    font-size: 0.7rem;
    color: #bbb;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
}
.mermaid-section {
    border: 1px solid #1a1a2a;
    border-radius: 4px;
    overflow: hidden;
    background: #07070f;
}
.mermaid-label {
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #333;
    padding: 0.3rem 0.8rem;
    border-bottom: 1px solid #1a1a2a;
}
.mermaid-container {
    padding: 0.8rem;
    overflow: auto;
    min-height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.mermaid-fallback {
    font-size: 0.65rem;
    color: #555;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
}
.action-bar {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.5rem 1.2rem;
    border-top: 1px solid #1a1a2a;
    flex-shrink: 0;
    background: #07070f;
}
.btn-tasks {
    background: #1a1040;
    border: 1px solid #4a3a8a;
    color: #9181f9;
    font-size: 0.65rem;
    padding: 0.22rem 0.75rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.15s;
}
.btn-tasks:hover:not(:disabled) { background: #251850; }
.btn-tasks:disabled { opacity: 0.4; cursor: default; }
.feedback {
    font-size: 0.62rem;
    color: #7c9e7c;
    flex: 1;
    font-style: italic;
}
.empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
}
</style>
