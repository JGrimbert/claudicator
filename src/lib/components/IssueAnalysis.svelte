<script lang="ts">
    import { afterUpdate, onMount, onDestroy } from "svelte";
    import { issueAnalysis, agentRunState, agentState, notifyTaskCreated, hoveredIssueNumber, planAllState, taskRefreshTick } from "$lib/stores/agent";

    const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frame = 0;
    let spinnerInterval: ReturnType<typeof setInterval> | null = null;

    let logArea: HTMLDivElement;
    let planLogArea: HTMLDivElement | null = null;
    let autoScroll = true;
    let mermaidDiv: HTMLDivElement | null = null;
    let mermaidRendered = false;
    let highlightedGroup: string | null = null;
    let createLoading = false;
    let createFeedback = "";

    onMount(() => {
        spinnerInterval = setInterval(() => { frame = (frame + 1) % FRAMES.length; }, 80);
        loadResult();
    });
    onDestroy(() => { if (spinnerInterval) clearInterval(spinnerInterval); });

    afterUpdate(() => {
        if (autoScroll && logArea) logArea.scrollTop = logArea.scrollHeight;
        if (planLogArea) planLogArea.scrollTop = planLogArea.scrollHeight;
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
        if ($issueAnalysis.result || $issueAnalysis.dismissed) return;
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
                mermaid.initialize({
                    startOnLoad: false,
                    theme: "base",
                    themeVariables: {
                        background:          "#05050f",
                        mainBkg:             "#0d0d16",
                        primaryColor:        "#0d0d16",
                        primaryTextColor:    "#888",
                        primaryBorderColor:  "#2a2a3a",
                        lineColor:           "#2a2a3a",
                        secondaryColor:      "#07070f",
                        tertiaryColor:       "#07070f",
                        edgeLabelBackground: "#05050f",
                        titleColor:          "#555",
                        fontFamily:          "'JetBrains Mono', monospace",
                        fontSize:            "11px",
                    }
                });
            }
            const { svg } = await mermaid.render("analysis-diagram", mermaidCode);
            if (mermaidDiv) {
                mermaidDiv.innerHTML = svg;
                const svgEl = mermaidDiv.querySelector("svg");
                if (svgEl) {
                    svgEl.removeAttribute("height");
                    svgEl.style.width = "100%";
                    svgEl.style.height = "auto";
                }
                attachMermaidClicks();
            }
        } catch {
            mermaidRendered = false;
            if (mermaidDiv) mermaidDiv.innerHTML = `<pre class="mermaid-fallback">${mermaidCode}</pre>`;
        }
    }

    function scrollToGroup(name: string) {
        highlightedGroup = name;
        const idx = groups.findIndex(g => g.name === name);
        if (idx >= 0) {
            document.getElementById(`group-card-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        setTimeout(() => { if (highlightedGroup === name) highlightedGroup = null; }, 1800);
    }

    function attachMermaidClicks() {
        if (!mermaidDiv) return;

        // Arrondir les coins des rects
        for (const rect of Array.from(mermaidDiv.querySelectorAll(".node rect"))) {
            (rect as SVGRectElement).setAttribute("rx", "4");
            (rect as SVGRectElement).setAttribute("ry", "4");
        }

        // Remonter les edges en fin de SVG pour qu'ils passent au-dessus des noeuds
        const svgRoot = mermaidDiv.querySelector("svg g");
        if (svgRoot) {
            for (const edge of Array.from(mermaidDiv.querySelectorAll(".edgePath, .edgeLabel"))) {
                svgRoot.appendChild(edge);
            }
        }

        // Injecter des chips cliquables pour chaque #N dans les labels
        for (const nodeLabel of Array.from(mermaidDiv.querySelectorAll(".nodeLabel"))) {
            if (!/#\d+/.test(nodeLabel.innerHTML)) continue;
            nodeLabel.innerHTML = nodeLabel.innerHTML.replace(/#(\d+)/g, (_, n) =>
                `<span class="mermaid-issue-chip" data-issue="${n}">#${n}</span>`
            );
            for (const chip of Array.from(nodeLabel.querySelectorAll(".mermaid-issue-chip"))) {
                const n = Number((chip as HTMLElement).dataset.issue);
                chip.addEventListener("click", (e) => { e.stopPropagation(); openIssue(n); });
            }
            // Forcer le div wrapper à être block centré (Mermaid le met en inline-block)
            const wrapper = nodeLabel.closest("div") as HTMLElement | null;
            if (wrapper) {
                wrapper.style.display = "block";
                wrapper.style.width = "100%";
                wrapper.style.textAlign = "center";
            }
        }

        // Pass 1 : libérer les contraintes
        requestAnimationFrame(() => {
            if (!mermaidDiv) return;
            for (const fo of Array.from(mermaidDiv.querySelectorAll(".node foreignObject"))) {
                fo.setAttribute("height", "500");
                fo.setAttribute("width",  "500");
                fo.setAttribute("overflow", "visible");
            }
            // Pass 2 : mesurer et redimensionner avec le vrai scale SVG
            requestAnimationFrame(() => {
                if (!mermaidDiv) return;
                const svgEl = mermaidDiv.querySelector("svg") as SVGSVGElement | null;
                const ctm   = svgEl?.getScreenCTM();
                const scaleX = ctm ? ctm.a : 1;
                const scaleY = ctm ? ctm.d : 1;
                for (const node of Array.from(mermaidDiv.querySelectorAll(".node"))) {
                    const fo    = node.querySelector("foreignObject");
                    const rect  = node.querySelector("rect");
                    const nodeLabel = node.querySelector(".nodeLabel") as HTMLElement | null;
                    if (!fo || !rect || !nodeLabel) continue;
                    const bb = nodeLabel.getBoundingClientRect();
                    if (!bb.height) continue;
                    const padH = 16, padW = 24;
                    const newH = bb.height / scaleY + padH;
                    const newW = bb.width  / scaleX + padW;
                    const oldH = parseFloat(rect.getAttribute("height") ?? "0");
                    const oldW = parseFloat(rect.getAttribute("width")  ?? "0");
                    const oldY = parseFloat(rect.getAttribute("y") ?? "0");
                    const oldX = parseFloat(rect.getAttribute("x") ?? "0");
                    rect.setAttribute("height", String(newH));
                    rect.setAttribute("y",      String(oldY - (newH - oldH) / 2));
                    if (newW > oldW) {
                        rect.setAttribute("width", String(newW));
                        rect.setAttribute("x",     String(oldX - (newW - oldW) / 2));
                    }
                    const finalW = Math.max(newW, oldW);
                    fo.setAttribute("height", String(newH));
                    fo.setAttribute("width",  String(finalW));
                    // Recentrer le groupe label
                    const labelG = fo.closest("g.label") as SVGGElement | null;
                    if (labelG) {
                        labelG.setAttribute("transform", `translate(${-finalW / 2}, ${-newH / 2})`);
                    }
                }
            });
        });

        // Rendre les noeuds sans #N cliquables vers leur groupe
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const node of Array.from(mermaidDiv.querySelectorAll(".node"))) {
            const text = (node.textContent ?? "").trim();
            if (/#\d+/.test(text)) continue;
            const normText = norm(text);
            const matching = groups.find(g => {
                const n = norm(g.name);
                return normText.includes(n) || n.includes(normText);
            });
            if (matching) {
                (node as HTMLElement).style.cursor = "pointer";
                node.addEventListener("click", () => scrollToGroup(matching.name));
                addHover(node as HTMLElement);
            }
        }
    }

    function addHover(node: HTMLElement) {
        const shape = node.querySelector("rect, circle, polygon") as SVGElement | null;
        if (!shape) return;
        node.addEventListener("mouseenter", () => shape.setAttribute("stroke", "#2a4a6a"));
        node.addEventListener("mouseleave", () => shape.setAttribute("stroke", "#1a2a40"));
    }

    async function openIssue(number: number) {
        agentState.update(s => ({ ...s, status: "loading", plan: null }));
        try {
            const res = await fetch(`/api/issue?number=${number}`);
            if (!res.ok) return;
            const full = await res.json();
            agentState.update(s => ({
                ...s,
                issue: full,
                status: "idle",
                navigationStack: [],
                knownSubIssueNumbers: [
                    ...new Set([...s.knownSubIssueNumbers, ...(full.subIssues?.map((si: any) => si.number) ?? [])])
                ]
            }));
        } catch {
            agentState.update(s => ({ ...s, status: "idle" }));
        }
    }

    function dismiss() {
        issueAnalysis.update(s => ({ ...s, result: null, dismissed: true, logs: [], running: false, updating: false, snapshotDiff: null }));
        mermaidRendered = false;
        createFeedback = "";
        groupFeedback = {};
    }

    // ── Parser les groupes depuis le texte Markdown de l'analyse ──────────
    type Group = { name: string; issues: number[]; dependsOn: string[]; summary: string };

    function parseGroups(text: string): Group[] {
        const groups: Group[] = [];
        // Chercher les blocs "### Groupe N — Nom"
        const blocks = text.split(/(?=### Groupe \d)/);
        for (const block of blocks) {
            const nameMatch = block.match(/### Groupe \d+ — (.+)/);
            if (!nameMatch) continue;
            const name = nameMatch[1].trim();
            const issueMatch = block.match(/Issues\s*:\s*((?:#\d+(?:,\s*)?)+)/);
            const issues = issueMatch
                ? [...issueMatch[1].matchAll(/#(\d+)/g)].map(m => parseInt(m[1]))
                : [];
            const depMatch = block.match(/Dépend de\s*:\s*(.+)/);
            const dependsOn = depMatch
                ? depMatch[1].split(/[,;]/).map(s => s.trim()).filter(Boolean)
                : [];
            const summaryMatch = block.match(/Résumé\s*:\s*(.+)/);
            const summary = summaryMatch ? summaryMatch[1].trim() : "";
            if (name && issues.length > 0) groups.push({ name, issues, dependsOn, summary });
        }
        return groups;
    }

    // ── Créer les tasks pour une liste d'issues ────────────────────────────
    let groupFeedback: Record<string, string> = {};

    async function createTasksForIssues(
        issueNumbers: number[],
        feedbackKey: string,
        snapshot: Array<{ number: number; title: string }>
    ) {
        const targets = snapshot.filter(s => issueNumbers.includes(s.number));
        if (!targets.length) { groupFeedback = { ...groupFeedback, [feedbackKey]: "Aucune issue" }; return; }
        let created = 0, existing = 0;
        await Promise.all(targets.map(async issue => {
            const r = await fetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: issue.title, issueNumber: issue.number })
            });
            if (r.ok) { (await r.json()).alreadyExisted ? existing++ : created++; }
            else { existing++; }
        }));
        const msg = `${created} créée${created > 1 ? "s" : ""}${existing ? `, ${existing} existaient` : ""}`;
        groupFeedback = { ...groupFeedback, [feedbackKey]: msg };
        if (created > 0) notifyTaskCreated();
    }

    async function createTasks(issueNumbers?: number[]) {
        if (createLoading) return;
        createLoading = true;
        createFeedback = "";
        try {
            const snap = await fetch("/api/issues/snapshot");
            if (!snap.ok) { createFeedback = "Snapshot introuvable"; return; }
            const { snapshot } = await snap.json();
            if (!snapshot?.length) { createFeedback = "Aucune issue dans la snapshot"; return; }

            const targets = issueNumbers
                ? snapshot.filter((s: any) => issueNumbers.includes(s.number))
                : snapshot;
            let created = 0, existing = 0;
            await Promise.all(targets.map(async (issue: { number: number; title: string }) => {
                const r = await fetch("/api/tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: issue.title, issueNumber: issue.number })
                });
                if (r.ok) { (await r.json()).alreadyExisted ? existing++ : created++; }
                else { existing++; }
            }));
            createFeedback = `${created} task${created > 1 ? "s" : ""} créée${created > 1 ? "s" : ""}${existing > 0 ? `, ${existing} existaient déjà` : ""}`;
            if (created > 0) notifyTaskCreated();
        } catch (e: any) {
            createFeedback = e.message ?? "Erreur";
        } finally {
            createLoading = false;
        }
    }

    async function createGroupTasks(group: Group) {
        if (createLoading) return;
        createLoading = true;
        groupFeedback = { ...groupFeedback, [group.name]: "…" };
        try {
            const snap = await fetch("/api/issues/snapshot");
            if (!snap.ok) return;
            const { snapshot } = await snap.json();
            await createTasksForIssues(group.issues, group.name, snapshot);
        } finally {
            createLoading = false;
        }
    }

    // ── Planifier toutes les tasks séquentiellement ───────────────────────
    let planLoading = false;
    let planFeedback = "";
    let planDone = 0;
    let planTotal = 0;

    async function planTasks() {
        if (planLoading || createLoading) return;
        planLoading = true;
        planFeedback = "";
        planDone = 0;
        try {
            const res = await fetch("/api/tasks");
            if (!res.ok) { planFeedback = "Erreur chargement tasks"; return; }
            const allTasks = await res.json();
            const toplan = allTasks.filter((t: any) => !t.hasPlan && t.status !== "running");
            planTotal = toplan.length;
            if (!toplan.length) { planFeedback = "Toutes les tasks sont déjà planifiées"; return; }

            // Trier selon l'ordre des groupes (P1 avant P2, etc.)
            const orderedTasks = [...toplan].sort((a: any, b: any) => {
                const pos = (n: number | undefined) => {
                    if (!n) return Infinity;
                    for (let gi = 0; gi < groups.length; gi++) {
                        const idx = groups[gi].issues.indexOf(n);
                        if (idx >= 0) return gi * 1000 + idx;
                    }
                    return Infinity;
                };
                return pos(a.issueNumber) - pos(b.issueNumber);
            });

            planAllState.set({ running: true, currentTaskId: null });

            for (const task of orderedTasks) {
                planAllState.update(s => ({ ...s, currentTaskId: task.id }));
                planFeedback = `${planDone + 1}/${planTotal} · ${task.title.slice(0, 28)}`;

                let prompt = task.title;
                try {
                    const ctxRes = await fetch("/api/context", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ taskId: task.id })
                    });
                    if (ctxRes.ok) {
                        const ctxData = await ctxRes.json();
                        if (ctxData.prompt) prompt = ctxData.prompt;
                    }
                } catch { /* fallback titre */ }

                agentRunState.set({ taskId: task.id, taskTitle: task.title, logs: [], running: true });
                try {
                    const runRes = await fetch("/api/agent/run", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ prompt, taskId: task.id })
                    });
                    if (runRes.ok && runRes.body) {
                        const reader = runRes.body.getReader();
                        const dec = new TextDecoder();
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            for (const raw of dec.decode(value).split("\n")) {
                                if (raw.startsWith("data: ")) {
                                    try { agentRunState.update(s => ({ ...s, logs: [...s.logs, JSON.parse(raw.slice(6))] })); }
                                    catch { }
                                }
                            }
                        }
                    }
                } finally {
                    agentRunState.update(s => ({ ...s, running: false }));
                    taskRefreshTick.update(n => n + 1);
                }

                planDone++;
                planFeedback = `${planDone}/${planTotal} planifiée${planDone > 1 ? "s" : ""}`;
            }
            planFeedback = `${planDone} task${planDone > 1 ? "s" : ""} planifiée${planDone > 1 ? "s" : ""}`;
        } catch (e: any) {
            planFeedback = e.message ?? "Erreur";
        } finally {
            planLoading = false;
            planAllState.set({ running: false, currentTaskId: null });
        }
    }

    $: highlightHoveredChips($hoveredIssueNumber);

    function highlightHoveredChips(n: number | null) {
        if (!mermaidDiv) return;
        for (const chip of Array.from(mermaidDiv.querySelectorAll(".mermaid-issue-chip"))) {
            const el = chip as HTMLElement;
            if (n !== null && el.dataset.issue === String(n)) {
                el.style.background = "#162030";
                el.style.borderColor = "#3a6a9a";
                el.style.color = "#7cb8ff";
            } else {
                el.style.background = "";
                el.style.borderColor = "";
                el.style.color = "";
            }
        }
    }

    $: visibleLogs = $issueAnalysis.logs.filter(l => l.type !== "usage" && !/^\[pid:\d+\]$/.test(l.line));
    $: systemLogs  = $issueAnalysis.logs.filter(l => l.type === "system" && !/^\[pid:\d+\]$/.test(l.line));
    $: lastStatus  = systemLogs.length > 0 ? systemLogs[systemLogs.length - 1].line : "";
    $: groups = $issueAnalysis.result ? parseGroups($issueAnalysis.result) : [];
    $: planLogs = $agentRunState.logs.filter(l => l.type !== "usage" && !/^\[pid:\d+\]$/.test(l.line));
    $: isActive = $issueAnalysis.running || $issueAnalysis.updating;
</script>

<div class="analysis">
    <div class="analysis-header">
        <span class="dot" class:running={isActive}></span>
        <span class="label">{$issueAnalysis.updating ? "Intégration des issues" : "Analyse des issues"}</span>
        {#if !isActive}
            <button class="btn-dismiss" onclick={dismiss}>✕ Fermer</button>
        {/if}
    </div>

    {#if isActive}
        <!-- Console de logs temps réel -->
        <div class="log-area" bind:this={logArea} onscroll={onScroll}>
            {#if visibleLogs.length === 0}
                <span class="hint blink">{FRAMES[frame]} {$issueAnalysis.updating ? "Intégration des nouvelles issues…" : "Initialisation de l'analyse…"}</span>
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
        <div class="result-area">

            <!-- Diagramme Mermaid -->
            {#if extractMermaid($issueAnalysis.result)}
                <div class="mermaid-section">
                    <div class="mermaid-label">Roadmap</div>
                    <div class="mermaid-container" bind:this={mermaidDiv}>
                        <span class="hint">{FRAMES[frame]} Rendu du diagramme…</span>
                    </div>
                </div>
            {/if}

            <!-- Groupes actionnables -->
            {#if groups.length > 0}
                <div class="groups-section">
                    {#each groups as group, i}
                        <div class="group-card" id="group-card-{i}" class:highlighted={highlightedGroup === group.name}>
                            <div class="group-header">
                                <span class="group-index">{i + 1}</span>
                                <span class="group-name">{group.name}</span>
                                {#if group.dependsOn.length > 0}
                                    <span class="group-dep">après {group.dependsOn.join(", ")}</span>
                                {/if}
                                <button
                                    class="btn-group-tasks"
                                    onclick={() => createGroupTasks(group)}
                                    disabled={createLoading}
                                    title="Créer les tasks pour ce groupe"
                                >{groupFeedback[group.name] ?? "＋ Tasks"}</button>
                            </div>
                            {#if group.summary}
                                <div class="group-summary">{group.summary}</div>
                            {/if}
                            <div class="group-issues">
                                {#each group.issues as n}
                                    <button class="issue-chip" onclick={() => openIssue(n)} title="Ouvrir l'issue #{n}">#{n}</button>
                                {/each}
                            </div>
                        </div>
                    {/each}
                </div>
            {:else}
                <!-- Fallback texte brut si le parsing échoue -->
                <pre class="result-text">{textWithoutMermaid($issueAnalysis.result)}</pre>
            {/if}
        </div>

        <div class="action-bar">
            {#if planFeedback}
                <span class="feedback">{planFeedback}</span>
            {:else if createFeedback}
                <span class="feedback">{createFeedback}</span>
            {/if}
            <button class="btn-tasks" onclick={() => createTasks()} disabled={createLoading || planLoading}>
                {createLoading ? "Création…" : "Créer tasks"}
            </button>
            <button class="btn-plan" onclick={planTasks} disabled={planLoading || createLoading}>
                {#if planLoading}
                    {planDone}/{planTotal} ⠿
                {:else}
                    Planifier tasks
                {/if}
            </button>
        </div>

        {#if planLoading || ($agentRunState.taskId && planLogs.length > 0 && !$agentRunState.running && planFeedback)}
            <div class="plan-log-area" bind:this={planLogArea}>
                <div class="plan-log-header">
                    <span class="plan-log-task">{$agentRunState.taskTitle}</span>
                    {#if $agentRunState.running}<span class="plan-log-spin">{FRAMES[frame]}</span>{/if}
                </div>
                {#each planLogs as entry}
                    <div class="plan-log-line" class:sys={entry.type === "system"}>{entry.line}</div>
                {/each}
            </div>
        {/if}

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
    overflow-x: auto;
    min-height: 80px;
}
.mermaid-container :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    margin: 3em auto;
}
/* Noeuds */
.mermaid-container :global(.node rect) {
    fill: #0a0a14 !important;
    stroke: #1e1e2e !important;
    stroke-width: 1px !important;
}
.mermaid-container :global(.node foreignObject div) {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    height: 100% !important;
    text-align: center !important;
}
.mermaid-container :global(.nodeLabel) {
    color: #9181f9 !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 0.65rem !important;
    line-height: 1.6 !important;
    text-align: center !important;
}
.mermaid-container :global(.node text) {
    fill: #9181f9 !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 11px !important;
}
/* Chips #N injectés dans les labels */
.mermaid-container :global(.mermaid-issue-chip) {
    color: #4a9eff !important;
    background: #0a1020 !important;
    border: 1px solid #1a2a40 !important;
    border-radius: 3px !important;
    padding: 0.05rem 0.3rem !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 0.6rem !important;
    cursor: pointer !important;
    display: inline-block !important;
    line-height: 1.4 !important;
    transition: color 0.12s, border-color 0.12s !important;
}
.mermaid-container :global(.mermaid-issue-chip:hover) {
    color: #7cb8ff !important;
    border-color: #2a4a6a !important;
}

/* Flèches en pointillés, discrètes */
.mermaid-container :global(.edgePath path) {
    stroke-dasharray: 4 3 !important;
    stroke: #2a2a3a !important;
    stroke-width: 1px !important;
}
.mermaid-container :global(.arrowheadPath) {
    fill: #2a2a3a !important;
    stroke: none !important;
    opacity: 0.5 !important;
}
/* Noeuds — formes supplémentaires (cohérence avec rect ci-dessus) */
.mermaid-container :global(.node circle),
.mermaid-container :global(.node polygon) {
    fill: #0a1020 !important;
    stroke: #1a2a40 !important;
    stroke-width: 1px !important;
}
.mermaid-fallback {
    font-size: 0.65rem;
    color: #555;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
}
/* ── Groupes actionnables ── */
.groups-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.group-card {
    border: 1px solid #1a1a2a;
    border-radius: 4px;
    background: #07070f;
    overflow: hidden;
    transition: border-color 0.2s, background 0.2s;
}
.group-card.highlighted {
    border-color: #3a2a5a;
    background: #0e0b1a;
}
.group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.7rem;
    border-bottom: 1px solid #111;
    flex-wrap: wrap;
}
.group-index {
    font-size: 0.55rem;
    color: #333;
    background: #111;
    border-radius: 50%;
    width: 1.3em;
    height: 1.3em;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.group-name {
    font-size: 0.68rem;
    color: #9181f9;
    font-weight: 500;
    flex: 1;
    min-width: 0;
}
.group-dep {
    font-size: 0.57rem;
    color: #333;
    font-style: italic;
    flex-shrink: 0;
}
.btn-group-tasks {
    background: none;
    border: 1px solid #2a2a4a;
    color: #4a4a7a;
    font-size: 0.58rem;
    padding: 0.1rem 0.45rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
}
.btn-group-tasks:hover:not(:disabled) { color: #9181f9; border-color: #7c6af7; }
.btn-group-tasks:disabled { opacity: 0.4; cursor: default; }
.group-summary {
    font-size: 0.62rem;
    color: #555;
    padding: 0.25rem 0.7rem;
    font-style: italic;
    border-bottom: 1px solid #111;
    line-height: 1.5;
}
.group-issues {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0.35rem 0.7rem;
}
.issue-chip {
    font-size: 0.6rem;
    color: #4a9eff;
    background: #0a1020;
    border: 1px solid #1a2a40;
    border-radius: 3px;
    padding: 0.05rem 0.35rem;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
}
.issue-chip:hover { color: #7cb8ff; border-color: #2a4a6a; }

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
.btn-plan {
    background: #0a1a10;
    border: 1px solid #2a4a3a;
    color: #4caf50;
    font-size: 0.65rem;
    padding: 0.22rem 0.75rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.15s;
}
.btn-plan:hover:not(:disabled) { background: #0f2a18; }
.btn-plan:disabled { opacity: 0.4; cursor: default; }
.plan-log-area {
    max-height: 180px;
    overflow-y: auto;
    border-top: 1px solid #1a1a2a;
    background: #04040c;
    flex-shrink: 0;
}
.plan-log-area::-webkit-scrollbar { width: 3px; }
.plan-log-area::-webkit-scrollbar-thumb { background: #1a1a2a; }
.plan-log-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.2rem 1.2rem;
    border-bottom: 1px solid #111;
    position: sticky;
    top: 0;
    background: #04040c;
    z-index: 1;
}
.plan-log-task {
    font-size: 0.58rem;
    color: #3a3a5a;
    font-style: italic;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.plan-log-spin { font-size: 0.7rem; color: #4caf50; flex-shrink: 0; }
.plan-log-line {
    font-size: 0.65rem;
    color: #777;
    line-height: 1.55;
    padding: 0 1.2rem;
    white-space: pre-wrap;
    word-break: break-word;
}
.plan-log-line.sys { color: #2a2a3a; font-style: italic; }
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
