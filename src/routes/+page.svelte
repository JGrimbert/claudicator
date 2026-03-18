<script lang="ts">
    import { onMount } from "svelte";
    import TopBar from "$lib/components/TopBar.svelte";
    import AgentConsole from "$lib/components/AgentConsole.svelte";
    import IssueAnalysis from "$lib/components/IssueAnalysis.svelte";
    import ArtifactViewer from "$lib/components/ArtifactViewer.svelte";
    import AgentInput from "$lib/components/AgentInput.svelte";
    import ProjetPanel from "$lib/components/ProjetPanel.svelte";
    import PlanPanel from "$lib/components/PlanPanel.svelte";
    import GlobalPlanView from "$lib/components/GlobalPlanView.svelte";
    import ClusterCodeView from "$lib/components/ClusterCodeView.svelte";
    import CoalCodeView from "$lib/components/CoalCodeView.svelte";
    import RoadmapViz from "$lib/components/RoadmapViz.svelte";
    import { JgrLayout, JgrTabs } from 'jgr-ui';
    import { agentRunState, issueAnalysis, projectUsage, planModeTask, globalPlanPrompt, clusterFocusedSymbol, coalCodeFocus } from "$lib/stores/agent";

    let activeMiddleTab: "roadmap" | "dag" | "plan" | "cluster" | "coal" = "roadmap";
    $: if ($planModeTask)             activeMiddleTab = "plan";
    $: if ($globalPlanPrompt)         activeMiddleTab = "plan";
    $: if ($issueAnalysis.running)    activeMiddleTab = "roadmap";
    $: if ($clusterFocusedSymbol)     activeMiddleTab = "cluster";

    // Bascule sur coal uniquement au changement d'issue (pas à chaque update de symboles)
    let _prevCoalIssueNum = -1;
    $: if ($coalCodeFocus && $coalCodeFocus.issueNum !== _prevCoalIssueNum) {
        _prevCoalIssueNum = $coalCodeFocus.issueNum;
        activeMiddleTab = "coal";
    }

    /**
     *  TODO: floralwhite, moccasin, peachpuff
     *  dimgrey
     */


    /**
     * DONE: Prompt contextuel de l'agent
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
     * DONE: Réduire le bruit du contexte envoyé à l’IA
     * Voir plans/todo-context-noise.md
     * Implémenté dans src/lib/server/agent/context.ts — loadSymbolMap(projectRoot, query, maxClasses)
     * Scoring par mots-clés du titre → top 12 classes pertinentes seulement.
     */

    /**
     * DONE: Automatiser le scoring de pertinence pour SYMBOL MAP via doc/mots-clés
     *
     * Pour réaliser ce to do il va falloir modifier et utiliser c:/cartography-lolve et ses facultées particulières
     * par exemple ici on va utiliser le systeme d'annotation et enrichir la documentation du code
     * pour toute méthode non décrite: soit n'apparaissant pas dans la liste de l'onglet "décrites 14/140",
     * soit n'ayant pas de commentaire au dessus de la déclaration, on va lui attribuer automatiquement une annotation
     * un commentaire via IA si besoin pour le décrire au regard de tout ce qu'on connait des autres listes.
     *
     * il faut que lolve-cartography enrichisse les elements qu'il créé lors d'un init full --force.
     * Je veux un diagramme .md du maximum sur mon application pour tout monitorer et faire du scoring de pertinence dessus.
     *
     * Ensuite on va pouvoir faire du scoring de pertinence pour ne garder que les symboles les plus pertinents dans le SYMBOL MAP, et ainsi réduire le bruit dans le prompt envoyé à l'IA:
     *
     * Problème
     * Certaines fonctions sont incluses dans le SYMBOL MAP même si elles ne sont
     * pas pertinentes pour la tâche courante (ex: usePersistentPanZoom). Cela crée
     * du bruit dans le prompt et réduit l’efficacité des suggestions IA.
     *
     * Objectif
     * Prioriser automatiquement les symboles pertinents en utilisant :
     *   - les commentaires/documentation des fonctions
     *   - les mots-clés extraits de la TASK
     *
     * Étapes d’implémentation
     *
     * 1. Extraire les mots-clés de la TASK
     *    - Nettoyer et tokeniser la phrase
     *    - Supprimer les stopwords
     *    - Conserver les mots significatifs
     *    Exemple : "Pouvoir sélectionner et faire varier les options d’un cadre"
     *      → ["sélectionner", "varier", "options", "cadre"]
     *
     * 2. Analyser les commentaires/doc des fonctions
     *    - Vérifier la présence de mots-clés dans :
     *        a) le commentaire au-dessus de la fonction
     *        b) la signature (nom + params)
     *    - Ajouter un score par mot-clé trouvé
     *
     * 3. Ajouter un scoring basé sur le voisinage structurel
     *    - +2 points si la fonction est appelée par un symbole déjà retenu
     *    - +1 point si dans le même fichier/module
     *
     * 4. Définir des tags facultatifs dans les commentaires pour guider le filtrage
     *    - @task-relevant → pertinent pour la tâche
     *    - @task-irrelevant → ignorer pour la tâche
     *
     * 5. Calculer un score final pour chaque symbole
     *    - Score = points mots-clés + points voisinage + tags
     *    - Filtrer pour ne garder que les N symboles les mieux scorés (N ≈ 10–15)
     *
     * 6. Générer le SYMBOL MAP final
     *    - Inclure uniquement les symboles pertinents
     *    - Fournir la signature / mini-contexte pour chaque symbole
     *
     * Résultat attendu
     * - SYMBOL MAP plus compact et ciblé
     * - Réduction du bruit (ex: usePersistentPanZoom disparaît si non pertinent)
     * - Meilleure précision et efficacité des suggestions IA
     *
     * Bonus
     * - Cette méthode peut être réutilisée pour toutes les tâches afin de créer
     *   automatiquement un contexte optimisé pour Claude Code.
     */

    /**
     * DONE: Sélection automatique des symboles pertinents pour le SYMBOL MAP
     *
     * Problème
     * Le SYMBOL MAP contient encore trop de symboles non liés à la tâche.
     * L’IA doit filtrer elle-même les éléments pertinents, ce qui crée du bruit
     * et réduit l’efficacité du prompt.
     *
     * Objectif
     * Générer automatiquement un SYMBOL MAP réduit (≈5–15 symboles) contenant
     * uniquement les éléments réellement pertinents pour la tâche décrite dans TASK.
     *
     * Principe général
     * Utiliser la phrase TASK comme point d’ancrage sémantique pour filtrer
     * les symboles de la codebase.
     *
     * Étapes d’implémentation
     *
     * 1. Extraire les mots-clés de TASK
     *    - Convertir la phrase en minuscules
     *    - Supprimer les mots très communs (stopwords)
     *    - Garder les mots significatifs
     *
     *    Exemple :
     *      TASK: "Sorted est devenu inutile puisque focused est géré séparément"
     *
     *      mots-clés retenus :
     *      ["sorted", "focused"]
     *
     *
     * 2. Rechercher les symboles liés à ces mots-clés
     *    Parcourir l’index de symboles et sélectionner ceux dont :
     *
     *      - le nom contient un mot-clé
     *      - ou dont la signature contient un mot-clé
     *
     *    Exemple :
     *
     *      useFocusedMap
     *      useFocusedSeed
     *
     *
     * 3. Ajouter le voisinage structurel
     *    Pour chaque symbole trouvé :
     *
     *      - ajouter la classe ou le module parent
     *      - ajouter les fonctions directement appelées (si CALL GRAPH disponible)
     *
     *    Objectif : fournir un minimum de contexte structurel.
     *
     *
     * 4. Limiter la taille finale
     *    Appliquer un plafond pour éviter le bruit :
     *
     *      SYMBOL_MAP_MAX = 15
     *
     *    Priorité de sélection :
     *
     *      1. symboles contenant directement un mot-clé
     *      2. symboles appelés par ceux-ci
     *      3. symboles parents
     *
     *
     * 5. Générer le SYMBOL MAP final
     *
     *    Format attendu :
     *
     *    SYMBOL MAP
     *
     *    useFocusedMap
     *      useFocusedMap(localKey = "focusedSeedsMap")
     *
     *    useFocusedSeed
     *      useFocusedSeed(filteredLibraries, focusedMap, isLoadingFocus)
     *
     *
     * Résultat attendu
     *
     * - SYMBOL MAP compact (~5–15 symboles)
     * - contexte fortement lié à la tâche
     * - réduction du bruit dans le prompt
     * - meilleure efficacité des réponses IA
     *
     *
     * Amélioration possible (optionnelle)
     *
     * Ajouter un scoring simple pour classer les symboles :
     *
     *    score =
     *      +5 si nom contient un mot-clé
     *      +3 si signature contient un mot-clé
     *      +2 si appelé par un symbole sélectionné
     *      +1 si dans le même fichier
     *
     * Puis garder les N meilleurs symboles.
     */

    /**
     * DONE: Console de l'agent:
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
     * TODO: il faut une option pour documenter le code en arborescence
     * - Le contexte peut referer au diagramme de la cartographie pour découvrir le code et ses éléments les plus pertinents,
     * mais il faut que ce diagramme soit lui même documenté pour que le contexte puisse s'appuyer dessus et faire du scoring de pertinence dessus.
     *
     */

    /** TODO: initial commit
     * - premier PR <3
     **/

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

    // ─── Splits verticaux ─────────────────────────────────────────────────────
    const ASIDE_SPLIT_KEY = "claudicator:aside-split";
    const MAIN_SPLIT_KEY  = "claudicator:main-split";
    const ASIDE_LIMITS = [20, 80] as const;
    const MAIN_LIMITS  = [10, 85] as const;

    let asideTopPct = 60;
    let mainTopPct  = 80;

    async function loadProjectUsage() {
        try {
            const res = await fetch("/api/usage");
            if (res.ok) projectUsage.set(await res.json());
        } catch { /* silencieux */ }
    }

    onMount(() => {
        loadProjectUsage();
        try {
            const raw = localStorage.getItem(ASIDE_SPLIT_KEY);
            if (raw) {
                const v = Number(raw);
                if (!isNaN(v)) asideTopPct = Math.max(ASIDE_LIMITS[0], Math.min(ASIDE_LIMITS[1], v));
            }
        } catch { /* ignore */ }
        try {
            const raw = localStorage.getItem(MAIN_SPLIT_KEY);
            if (raw) {
                const v = Number(raw);
                if (!isNaN(v)) mainTopPct = Math.max(MAIN_LIMITS[0], Math.min(MAIN_LIMITS[1], v));
            }
        } catch { /* ignore */ }
    });

    // Handle vertical aside split
    let draggingV = false;
    let dragVStartY = 0;
    let dragVStartPct = 60;
    let asideEl: HTMLElement | null = null;

    function startDragV(e: MouseEvent) {
        draggingV = true;
        dragVStartY = e.clientY;
        dragVStartPct = asideTopPct;
        e.preventDefault();
    }

    // Handle vertical main split (plan / carto)
    let draggingMain = false;
    let dragMainStartY = 0;
    let dragMainStartPct = 50;
    let mainEl: HTMLElement | null = null;

    function startDragMain(e: MouseEvent) {
        draggingMain = true;
        dragMainStartY = e.clientY;
        dragMainStartPct = mainTopPct;
        e.preventDefault();
    }

    function onMove(e: MouseEvent) {
        if (draggingV && asideEl) {
            const h = asideEl.offsetHeight;
            const deltaPct = ((e.clientY - dragVStartY) / h) * 100;
            asideTopPct = Math.max(ASIDE_LIMITS[0], Math.min(ASIDE_LIMITS[1], dragVStartPct + deltaPct));
            return;
        }
        if (draggingMain && mainEl) {
            const h = mainEl.offsetHeight;
            const deltaPct = ((e.clientY - dragMainStartY) / h) * 100;
            mainTopPct = Math.max(MAIN_LIMITS[0], Math.min(MAIN_LIMITS[1], dragMainStartPct + deltaPct));
        }
    }

    function onUp() {
        if (draggingV) {
            draggingV = false;
            try { localStorage.setItem(ASIDE_SPLIT_KEY, String(asideTopPct)); } catch { /* ignore */ }
        }
        if (draggingMain) {
            draggingMain = false;
            try { localStorage.setItem(MAIN_SPLIT_KEY, String(mainTopPct)); } catch { /* ignore */ }
        }
    }

    // ─── Tabs centre ──────────────────────────────────────────────────────────
    $: midTabs = [
        { id: 'roadmap', label: 'roadmap' },
        { id: 'dag',     label: 'dag'     },
        { id: 'plan',    label: 'plan'    },
        ...($clusterFocusedSymbol ? [{ id: 'cluster', label: 'cluster' }] : []),
        ...($coalCodeFocus ? [{ id: 'coal', label: '#' + $coalCodeFocus.issueNum }] : []),
    ];
</script>

<svelte:window onmousemove={onMove} onmouseup={onUp} />

<JgrLayout
    storageKey="claudicator:panel-widths"
    leftWidth={300}
    rightWidth={340}
    leftLabel="PROJET"
    rightLabel="PLAN"
>
    {#snippet topbar()}
        <TopBar />
    {/snippet}

    {#snippet left()}
        <div
            class="aside-inner"
            class:dragging-v={draggingV}
            bind:this={asideEl}
        >
            <div class="aside-top" style="height: {asideTopPct}%">
                <ArtifactViewer />
            </div>
            <div
                class="vhandle"
                role="separator"
                aria-label="Redimensionner entre Artefact et Issues"
                onmousedown={startDragV}
                class:active={draggingV}
            ></div>
            <ProjetPanel />
        </div>
    {/snippet}

    {#snippet center()}
        <div
            class="main-inner"
            class:dragging-main={draggingMain}
            bind:this={mainEl}
        >
            <!-- ── PLAN (haut) ── -->
            <div class="main-top" style="height: {mainTopPct}%">
                <JgrTabs
                    tabs={midTabs}
                    activeTab={activeMiddleTab}
                    onchange={id => activeMiddleTab = id}
                >
                    {#snippet children(tab)}
                        {#if tab === 'roadmap'}
                            {#if $issueAnalysis.running || $issueAnalysis.result}
                                <IssueAnalysis />
                            {:else}
                                <div class="plan-placeholder"><span>Aucune analyse disponible</span></div>
                            {/if}
                        {:else if tab === 'dag'}
                            <RoadmapViz />
                        {:else if tab === 'plan'}
                            {#if $globalPlanPrompt}
                                <GlobalPlanView />
                            {:else if $planModeTask}
                                <AgentInput task={$planModeTask} />
                            {:else}
                                <div class="plan-placeholder"><span>Sélectionner une task → Plan</span></div>
                            {/if}
                        {:else if tab === 'cluster'}
                            {#if $clusterFocusedSymbol}
                                <ClusterCodeView symbol={$clusterFocusedSymbol} />
                            {:else}
                                <div class="plan-placeholder"><span>Cliquer sur un symbole dans CLUSTERS</span></div>
                            {/if}
                        {:else if tab === 'coal'}
                            {#if $coalCodeFocus}
                                <CoalCodeView issueNum={$coalCodeFocus.issueNum} symbols={$coalCodeFocus.symbols} />
                            {:else}
                                <div class="plan-placeholder"><span>Aucun symbole coalescent sélectionné</span></div>
                            {/if}
                        {/if}
                    {/snippet}
                </JgrTabs>
            </div>
            <!-- ── Séparateur ── -->
            <div
                class="vhandle"
                role="separator"
                aria-label="Redimensionner plan / carto"
                onmousedown={startDragMain}
                class:active={draggingMain}
            ></div>
            <!-- ── CARTO (bas) ── -->
            <div class="main-carto">
                <AgentConsole />
            </div>
        </div>
    {/snippet}

    {#snippet right()}
        <PlanPanel />
    {/snippet}
</JgrLayout>

<style>
/* ── Wrappers internes (contenu des snippets JgrLayout) ── */
.aside-inner, .main-inner {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}
.aside-inner.dragging-v  { user-select: none; cursor: row-resize; }
.main-inner.dragging-main { user-select: none; cursor: row-resize; }

/* ── Handle vertical (double bordure) ── */
.vhandle {
    flex-shrink: 0;
    height: 6px;
    cursor: row-resize;
    border-top: 1px solid #1e1e1e;
    border-bottom: 1px solid #1e1e1e;
    background: transparent;
    transition: border-color 0.15s;
}
.vhandle:hover, .vhandle.active { border-color: #3a3a3a; }

/* ── Split aside ── */
.aside-top {
    flex-shrink: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

/* ── Split main ── */
.main-top {
    flex-shrink: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.main-carto {
    flex: 1;
    min-height: 60px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

/* ── Placeholder centre ── */
.plan-placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #222;
    font-size: 0.65rem;
    font-style: italic;
    font-family: 'JetBrains Mono', monospace;
}
</style>
