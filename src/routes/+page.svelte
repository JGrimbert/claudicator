<script lang="ts">
    import { onMount } from "svelte";
    import TopBar from "$lib/components/TopBar.svelte";
    import IssueList from "$lib/components/IssueList.svelte";
    import AgentConsole from "$lib/components/AgentConsole.svelte";
    import ArtifactViewer from "$lib/components/ArtifactViewer.svelte";
    import TaskList from "$lib/components/TaskList.svelte";

    /**
     * TODO: Prompt contextuel de l'agent
     * Voir plan détaillé : plans/todo-prompt-context.md
     *
     * Pipeline : item sélectionné → scan codebase → Context → prompt prérempli → lancement agent
     *
     * 1. SÉLECTION DE L'ITEM
     *    Issue GitHub / task / TODO → point d'entrée du contexte
     *
     * 2. CONSTRUCTION DU CONTEXT (via lolve-cartography)
     *    a) Symbol Map  : classes, méthodes, fonctions exportées
     *    b) Call Graph  : appels inter-classes (heuristique regex)
     *    c) Dependencies: imports par fichier
     *    d) Concept Map : concepts métier du codebase (concepts.json)
     *
     * 3. FORMAT DU PROMPT FINAL
     *    TASK / OBJECTIF / CONCEPTS / SYMBOL MAP / CALL GRAPH / DEPENDENCIES / MATCHES
     *
     * 4. INPUT UI (colonne des tasks)
     *    Textarea préremplie + bouton "Lancer l'agent"
     *
     * Composants à créer :
     *    src/lib/server/services/cartography.ts  — scanner regex
     *    src/lib/server/agent/context.ts         — assembleur de Context
     *    src/lib/server/agent/prompt.ts          — formateur de prompt
     *    src/routes/api/context/+server.ts       — endpoint API
     *    src/lib/components/AgentInput.svelte    — textarea + bouton lancement
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
     * - je n'arrive pas à faire fonctionner les barres de redimensionnement des colonnes
     * - il faut une barre de redim latérale pour la partie input texte + listes d'onglets + liste d'occurences
     */

    /** TODO: Prompt prérempli pour chaque task
     * Actuellement quand je clique sur les .md de la cartography, ça m'affiche le contenu brut du .md dans la section centrale
     * - quand je selectionne une task, je veux que la section du milieu entre les colones est remplacé par le prompt prérempli pour cette task, avec un bouton "Lancer l'agent" en dessous
     * - les aperçus de readme.md et claude.md doivent être bcp plus succint: juste le titre
     * - les titres ne disparaissent pas mais s'affichent dans la section centrale quand on clique dessus, et c'est là que le prompt prérempli s'affiche
     * - les composant actules en dessous de la zone centrale (input recherche, liste méthodes/fichiers/todo etc, doit pouvoir être retrouvé qd on clique sur un onglet dans la section centrale, et ne pas disparaitre systématiquement à chaque click sur une task
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
