<script lang="ts">
    import { onMount } from "svelte";
    import TopBar from "$lib/components/TopBar.svelte";
    import IssueList from "$lib/components/IssueList.svelte";
    import AgentConsole from "$lib/components/AgentConsole.svelte";
    import ArtifactViewer from "$lib/components/ArtifactViewer.svelte";
    import TaskList from "$lib/components/TaskList.svelte";

    /**
     * TODO: Intégration Claude Code
     *
     * Objectif:
     * Permettre à l'application d'appeler Claude Code localement et d'afficher
     * sa sortie dans l'interface (console agent / artifact viewer).
     *
     * Backend:
     * - créer un service serveur qui exécute la CLI "claude"
     * - utiliser child_process.spawn pour lire stdout en streaming
     * - envoyer les logs progressivement au frontend (SSE ou websocket)
     *
     * Endpoint:
     * - POST /api/agent/run
     * - payload:
     *      {
     *          prompt
     *          issueNumber
     *          taskId
     *      }
     *
     * Flux:
     * - l'utilisateur lance une task
     * - le backend appelle "claude <prompt>"
     * - les lignes de sortie sont streamées vers l'UI
     * - la console affiche le raisonnement et les actions de l'agent
     *
     * Artifact capture:
     * - détecter automatiquement dans la sortie:
     *      - plans markdown
     *      - patch git
     *      - commandes exécutées
     *
     * UI:
     * - afficher la sortie dans la Console de l'agent
     * - afficher les artefacts dans un panneau dédié:
     *      - plan
     *      - diff patch
     *      - logs
     *
     * Sécurité:
     * - exécution uniquement côté serveur
     * - sandbox du repo agent
     * - limiter les commandes autorisées
     */


    /**
     * TODO: Console de l'agent:
     *
     * - afficher les logs temps réel de l'agent
     * - différencier logs système / logs agent / logs task
     * - afficher les étapes du workflow agent:
     *      - plan generation
     *      - step execution
     *      - patch generation
     *      - commit / push
     * - permettre d'interrompre une tâche en cours
     * - permettre de rejouer une étape
     *
     */

    /**
     * TODO: Amélioration d'une task
     * - le bouton de retour est moche il faut trouver mieux
     * - transition animée douce au début
     */

    /** TODO: UI
     * - le backougrnd bleu nuit de la liste METHODES 140 | FICHIERS 61 | ... doit être reservé uniquement à l'input text central
     */

    /**
     * TODO: Description de la issue dynamique
     * - la task selectionnée doit afficher la description de l'issue associée
     */

    /**
     * TODO: Intégration avec GitHub API
     */

    /**
     * TODO: Les colonnes latérales peuvent devenir de petits onglers verticaux
     * - on garde la présentation actuelle par defaut et on ajoute une rangée verticale pour pouvoir switcher de vues
     * - de là on controle les sections à afficher dans la colonne (ex: artefacts, issues, console, etc.)
     *
     */

    /**
     * TODO: Version mobile avec lien SSH pour se connecter à l'agent depuis un terminal mobile (Termius, etc.):
     * - Afficher un QR code avec les infos de connexion (host, port, username, etc.) pour faciliter la connexion depuis le mobile
     - Ajouter une section "Mobile Access" dans le TopBar ou un bouton dédié pour afficher les infos de connexion
     - Permettre d'envoyer des commandes simples depuis l'interface web qui seraient exécutées sur l'agent et dont les résultats seraient affichés dans la console (ex: "uptime", "df -h", etc.)
     */

        // TODO: add PR list, review panel, etc.

        // TODO: add global error handling and display (e.g. toast notifications)

        // TODO: add loading states for each panel

        // TODO: add keyboard shortcuts for common actions (e.g. refresh, focus panels, etc.)

        // TODO: add user settings panel (e.g. theme, notifications, etc.)

        // TODO: add support for multiple agents and switching between them

    // ─── Colonnes redimensionnables ───────────────────────────────────────────
    const STORAGE_KEY = "claudicator:panel-widths";
    const LIMITS = { aside: [180, 600], section: [200, 600] } as const;

    function loadWidths() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const p = JSON.parse(raw);
                return {
                    aside:   Math.max(LIMITS.aside[0],   Math.min(LIMITS.aside[1],   p.aside   ?? 300)),
                    section: Math.max(LIMITS.section[0], Math.min(LIMITS.section[1], p.section ?? 340)),
                };
            }
        } catch { /* ignore */ }
        return { aside: 300, section: 340 };
    }

    let widths = { aside: 300, section: 340 };
    onMount(() => { widths = loadWidths(); });

    function saveWidths() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widths)); } catch { /* ignore */ }
    }

    let dragging: "aside" | "section" | null = null;
    let dragStartX = 0;
    let dragStartW = 0;

    function startDrag(e: MouseEvent, panel: "aside" | "section") {
        dragging = panel;
        dragStartX = e.clientX;
        dragStartW = widths[panel];
        e.preventDefault();
    }

    function onMove(e: MouseEvent) {
        if (!dragging) return;
        const delta = e.clientX - dragStartX;
        const [min, max] = LIMITS[dragging];
        const next = dragging === "aside"
            ? Math.max(min, Math.min(max, dragStartW + delta))
            : Math.max(min, Math.min(max, dragStartW - delta));
        widths = { ...widths, [dragging]: next };
    }

    function onUp() {
        if (dragging) { saveWidths(); dragging = null; }
    }
</script>

<svelte:window onmousemove={onMove} onmouseup={onUp} />

<div class="app" class:dragging>
    <TopBar />
    <div class="panels">
        <aside style="width: {widths.aside}px">
            <ArtifactViewer />
            <IssueList />
        </aside>
        <div
            class="handle"
            role="separator"
            aria-label="Redimensionner le panneau gauche"
            onmousedown={e => startDrag(e, "aside")}
            class:active={dragging === "aside"}
        ></div>
        <main>
            <AgentConsole />
        </main>
        <div
            class="handle"
            role="separator"
            aria-label="Redimensionner le panneau droit"
            onmousedown={e => startDrag(e, "section")}
            class:active={dragging === "section"}
        ></div>
        <section style="width: {widths.section}px">
            <TaskList />
        </section>
    </div>
</div>

<style>
.app {
    display: flex;
    flex-direction: column;
    height: 100vh;
}
.app.dragging { user-select: none; cursor: col-resize; }
.panels {
    display: flex;
    flex: 1;
    min-height: 0;
}
aside {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
}
main {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
section {
    flex-shrink: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.handle {
    flex-shrink: 0;
    width: 6px;
    cursor: col-resize;
    border-left: 1px solid #1e1e1e;
    border-right: 1px solid #1e1e1e;
    background: transparent;
    transition: border-color 0.15s;
}
.handle:hover, .handle.active { border-color: #3a3a3a; }
</style>
