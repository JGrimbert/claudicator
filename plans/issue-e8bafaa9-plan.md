## Résumé

**Volume** : 6 087 lignes CSS / 15 028 totales (41%), 46 composants. Les 5 plus volumineux totalisent ~1 800 lignes CSS.

**Problèmes principaux** :
1. **Duplication systémique** : 8 patterns identiques répétés dans 5 à 20 fichiers (scrollbar webkit, panel-header, blink, spinner braille, ghost-btn, mono-text, status-badge, flex-col-fill)
2. **Classes mortes confirmées** : ~35 classes sur 8 composants — dont 11 dans AgentConsole (bloc stats-bar entier) et 8 dans MermaidDiagram (faux positifs mermaid.js)
3. **Classes business-specific** : >90 classes contenant des termes métier sans abstraction agnostique
4. **Couleurs hardcodées sans variable CSS** : `#6655aa`, `#3a7f8f`, `#3a7a48`, `#7a5e1e`, `#a78bfa`, `#f87171`... impossibles à thémifier
5. **Workflow buttons dupliqués** : `.wf-btn`/`.wf-active`/`.wf-secondary`/`.wf-disabled` copié-collé dans PatchViewer et PushMergePanel depuis WorkflowBar

**Priorités** :
- P1 : Extraire scrollbar, blink, spin-braille dans `app.css` global (6–8 fichiers impactés chacun)
- P2 : Supprimer le bloc stats-bar mort dans AgentConsole + 10 autres classes mortes confirmées
- P3 : Candidats jgr-ui : JgrScrollable, JgrPanelHeader, JgrStatusBadge

---

## Fichiers prioritaires

### src/lib/components/ArtifactViewer.svelte
- **Mortes candidates :** aucune confirmée. `edit-btn--confirm` est utilisée mais non définie — hérite de `.edit-btn` (à documenter).
- **Patterns répétés :**
  - Scrollbar webkit (`.content`, `.plan-content`) — présent dans **8 fichiers**
  - Panel header uppercase (`.panel-header`) — présent dans **10 fichiers**
  - Animation blink (`.blink`) — présent dans **6 fichiers**
  - Ghost button (`.new-issue-btn`, `.edit-btn`) — présent dans **20+ fichiers**
  - Mono text JetBrains Mono + pre-wrap (`.plan`, `.body-text`) — présent dans **6 fichiers**
  - Couleurs hardcodées pour sym-sec variants (`#6655aa`, `#3a7f8f`, `#3a7a48`, `#7a5e1e`) sans variable CSS
- **Abstractions :**
  - `.plan-section` → `.content-section`
  - `.plan-header` → `.section-header`
  - `.plan-label` → `.section-label`
  - `.plan-content` → `.scrollable-content`
  - `.plan` (bloc texte) → `.mono-text`
  - `.issue-body` → `.detail-body`
  - `.issue-title` → `.detail-title`
  - `.sub-issues` → `.child-list`
  - `.sub-item` → `.child-item`
  - `.new-issue-btn` → `.add-btn`
  - `.dbg-panel` → `.collapsible-panel`
  - `.dbg-toggle` → `.panel-toggle`
  - `.dbg-toggle-meta` → `.panel-meta`
  - `.sym-tree` → `.tree-root`
  - `.sym-sec` → `.tree-section`
  - `.sym-row` → `.tree-row`
  - `.sym-code-btn` → `.inline-action-btn`
- **Candidat jgr-ui :** `JgrCollapsible` — panneau repliable avec toggle (icon + label + meta). Props : `label`, `meta?`, `defaultOpen?: boolean`. Remplace `.dbg-panel`/`.dbg-toggle` ici et `.eval-panel` dans IssueGroupCard.

---

### src/lib/components/FullPlanView.svelte
- **Mortes candidates :** `fp-generating` et `fp-loading` sont utilisées dans le template mais non définies dans `<style>` — classes sans style propre, utilisées probablement pour ciblage JS (à documenter).
- **Patterns répétés :**
  - Spinner braille (`@keyframes spin-braille` + `::before` content) — **2 fichiers** (FullPlanView + AgentConsole), keyframe identique
  - 4 variantes ghost-btn dans ce seul fichier (`.fp-reset-btn`, `.fp-stack-btn`, `.fp-newcycle-btn`, `.fp-close-issues-btn`) — patterns quasi-identiques, seules les couleurs diffèrent
  - Status badge coloré (`.fp-dag-badge-running/done/error`) — même pattern que `.done-badge`/`.twin-badge` dans IssueGroupCard
  - Panel header uppercase (`.fp-step-header`, `.fp-dag-title`, `.fp-steps-title`) — **10e occurrence**
- **Abstractions :**
  - `.fp-plan-row` → `.view-content-row`
  - `.fp-dag-row` → `.node-card`
  - `.fp-dag-badge` → `.status-badge`
  - `.fp-dag-badge-running/done/error` → `.status-badge--running/done/error`
  - `.fp-step-btn` → `.item-btn`
  - `.fp-stack-btn` → `.group-btn`
  - `.fp-edit-ta` → `.code-textarea`
  - `.fp-actions-sep` → `.separator`
  - `.fp-back-btn` → `.nav-back-btn`
- **Candidat jgr-ui :** `JgrStatusBadge` — badge coloré par statut avec variantes running/done/error/idle. Props : `status: 'running'|'done'|'error'|'idle'|string`, `label?`. Remplace `.fp-dag-badge-*` ici et les badges dans IssueGroupCard (**5+ fichiers**).

---

### src/lib/components/DiagramViewer.svelte
- **Mortes candidates :** `has-methods` et `has-kids` sont utilisées mais non définies — servent de sélecteurs CSS parents (ex. `.dv-row.has-kids .dv-toggle`). Pas mortes, juste non définies directement.
- **Patterns répétés :**
  - Scrollbar webkit (`.dv-tree`, `.dv-pre`) — **8e occurrence**
  - Pattern row tree (`.dv-row` hover background, `.dv-mrow` hover) — similaire à IssueGroupCard `.group-issue`, TaskList
  - Mono text (`.dv-pre`) — **6e occurrence**
  - Section header (`.dv-section`) — variante uppercase du panel-header pattern
  - Dot indicateur 5×5px border-radius 50% (`.dv-dot`, `.dv-mdot`, `.dv-leg-dot`) — 3 définitions quasi-identiques dans ce seul fichier
- **Abstractions :**
  - `.dv-comment-bar` → `.annotation-bar`
  - `.dv-comment-btn` → `.action-btn`
  - `.dv-comment-log` → `.log-stream`
  - `.dv-clog-line` → `.log-line`
  - `.dv-clog-error` → `.log-line--error`
  - `.dv-snippet` → `.code-panel`
  - `.dv-snippet-header` → `.code-panel-header`
  - `.dv-hint` → `.empty-hint`
  - `.dv-role` → `.role-badge`
  - `.dv-leg-item` → `.legend-item`
  - `.dv-leg-dot` → `.legend-dot`
  - `.dv-tree` → `.symbol-tree`
- **Candidat jgr-ui :** `JgrTreeRow` — ligne arborescente cliquable avec indentation, toggle, et slot right. Props : `depth`, `toggleable`, `active`, `prefix?`. Remplace `.dv-row`/`.dv-prefix`/`.dv-toggle`/`.dv-toggle-ph` ici et le pattern similaire dans FileTree (**3+ fichiers**).

---

### src/lib/components/IssueGroupCard.svelte
- **Mortes candidates (à valider) :** `.stack-group`, `.stack-box`, `.tree-branch-head`, `.residual-connector`, `.sub-extra-kw`, `.tree-leaf`, `.group-residual`, `.residual-head`, `.residual-label`, `.sub-keyword`, `.sub-count`, `.sub-haiku-inline`, `.btn-stack-plan` — 13 classes définies absentes de la liste utilisées. Peuvent être dans des blocs `{#if}` conditionnels. ⚠ Valider dans le template avant suppression.
- **Patterns répétés :**
  - Ghost button + disabled : 5 variantes locales (`.btn-stack-plan`, `.btn-evaluate`, `.btn-purge-done`, `.btn-full-plan`, `.btn-create-parent`)
  - Animation blink (`.eval-cursor`) — **6e occurrence** du même keyframe
  - Mono text pre-wrap (`.eval-result`) — **6e occurrence**
  - Status badge (`.done-badge`, `.twin-badge`) — même pattern que `.fp-dag-badge-*` dans FullPlanView
- **Abstractions :**
  - `.group-card` → `.selectable-card`
  - `.group-keyword` → `.tag-primary`
  - `.group-extra-kw` → `.tag-secondary`
  - `.issue-num` → `.item-id`
  - `.issue-title` → `.item-label`
  - `.done-badge` → `.status-badge--done`
  - `.twin-badge` → `.badge`
  - `.eval-panel` → `.analysis-panel`
  - `.eval-panel-head` → `.panel-header`
  - `.btn-evaluate` → `.btn-analyze`
  - `.btn-purge-done` → `.btn-destructive`
  - `.sub-issues` → `.nested-list` (⚠ même nom `.sub-issues` défini différemment dans ArtifactViewer — noms en collision, Svelte scoping protège mais source de confusion)
  - `.stack-group` → `.group-cluster`
  - `.stack-box` → `.cluster-box`
- **Candidat jgr-ui :** `JgrSelectableCard` — carte cliquable avec état `selected`, variante `tier: 'hot'|'warm'|'cool'`. Props : `selected`, `tier`. Remplace `.group-card` + ses modificateurs data-tier.

---

### src/lib/components/AgentConsole.svelte
- **Mortes candidates :**
  - **Bloc stats-bar entier** (11 classes) : `.stats-bar`, `.stat`, `.stat-l`, `.stat-v`, `.sep`, `.spacer`, `.stat-meta`, `.stat-model`, `.stat-fidx`, `.ok`, `.stat-ts` — toutes définies, aucune dans utilisées → probable mort après refactoring du composant
  - `.agent-search-header`, `.agent-input`, `.search-submit`, `.search-input` — 4 classes d'un bloc recherche absent des utilisées (⚠ `.search-input` est générique, vérifier les sous-composants)
  - `.blink` — définie, non référencée dans utilisées (**6e occurrence** inutile)
- **Patterns répétés :**
  - Scrollbar webkit (`.result-list`) — **8e occurrence**
  - Spinner braille (`@keyframes spin-braille`, `.tc-spin::before`) — keyframe identique à FullPlanView
  - Panel header (`.section-header`) — **10e occurrence**
  - Mono text (`.exp-content`, `.tc-output`, `.cmd-line`) — **6e occurrence**
  - Ghost button (`.search-submit`, `.tc-dismiss`) — N+1
- **Abstractions :**
  - `.agent-wrapper` → `.console-wrapper`
  - `.todos-section` → `.tabs-panel`
  - `.todos-header` → `.tab-bar`
  - `.atlas-init-bar` → `.init-bar`
  - `.cmd-logs` → `.log-block`
  - `.cmd-line` → `.log-line`
  - `.doc-files-tab` → `.file-list`
  - `.exp-content` → `.mono-content`
  - `.result-area` → `.content-area`
  - `.grep-file` → `.file-path`
  - `.grep-content` → `.match-content`
- **Candidat jgr-ui :** `JgrTabBar` — barre d'onglets horizontale avec scroll sans scrollbar visible, séparateurs border-right. Props : `tabs: { id, label, count?, variant? }[]`, `active`. Remplace `.todos-header`/`.tab`/`.tab-active`/`.tab-todo`/`.tab-count` ici et `.panel-tabs`/`.tab` dans PlanPanel (**2+ fichiers**).

---

## Composants secondaires — points saillants

**src/lib/components/FullPlanIssueTree.svelte** (258l, 57%)
- Mortes confirmées : `.is-patch-tests`, `.is-patch-no-tests`, `.is-no-patch` — 3 classes

**src/lib/components/TaskList.svelte** (153l, 31%)
- Mortes confirmées : `.item-row`, `.item-title` — 2 classes
- Pattern répété : `.panel-header` identique à ArtifactViewer

**src/lib/components/MermaidDiagram.svelte** (121l, 33%)
- Mortes candidates (faux positifs) : `.node`, `.nodeLabel`, `.mermaid-issue-chip`, `.flowchart-link`, `.edge-pattern-solid`, `.edgePath`, `.arrowheadPath`, `.mermaid-fallback` — classes injectées dynamiquement par mermaid.js dans le DOM SVG, absentes du template Svelte → **ne pas supprimer**

**src/lib/components/ArchiView.svelte** (111l, 52%)
- Mortes candidates : `.atlas-header`, `.atlas-title`, `.atlas-subtitle` — 3 classes
- Termes métier : `.atlas-*`, `.region-card`, `.region-name` → abstraction possible en `.viz-header`, `.cluster-card`, `.cluster-name`

**src/lib/components/plan/PlanTabSkills.svelte** (134l, 55%)
- Mortes confirmées : `.skill-badge--coal`, `.skill-badge--historical`, `.skill-badge--commit` — 3 classes

**src/lib/components/plan/PlanTabClusters.svelte + PlanTabHistory.svelte**
- `section-label` définie dans les deux fichiers avec des styles différents — même nom de classe, scoping Svelte protège mais source de confusion à l'audit

**src/routes/+layout.svelte** (43l, 78%)
- Morte confirmée : `.monospace` — 1 classe

**src/lib/components/PatchViewer.svelte + PushMergePanel.svelte**
- `.wf-btn`, `.wf-active`, `.wf-secondary`, `.wf-disabled` dupliqués **mot pour mot** depuis WorkflowBar.svelte — extraction vers un fichier partagé ou usage du composant WorkflowBar

---

## Patterns globaux à unifier

- **Scrollbar webkit** (4px, track transparent, thumb var(--border)) : ArtifactViewer, DiagramViewer, AgentConsole, FullPlanIssueTree, IssueGroups, TaskList, PlanTabClusters, ConsoleDrawer → **8 fichiers** — candidat `app.css` global ou JgrScrollable
- **Animation blink** (`@keyframes blink { 50% { opacity: 0.3; } }`) : ArtifactViewer, AgentConsole, IssueGroupCard, IssueAnalysis, CssAnalysis, PlanBatchConsole → **6 fichiers** — candidat `app.css` global
- **Spinner braille** (`@keyframes spin-braille { 0% { content: "⠋"; } ... }`) : FullPlanView, AgentConsole → **2 fichiers** (+ RunConsole probable) — candidat JgrConsole ou `app.css`
- **Panel header uppercase** (flex, padding 0.6rem 1rem, text-transform uppercase, letter-spacing 0.1em, border-bottom) : ArtifactViewer, AgentConsole, IssueGroups, TaskList, PlanTabClusters, PlanTabSkills, PlanTabHistory, PlanPanel, TopBar, DiagramViewer → **10 fichiers**
- **Ghost button + disabled** (background none, border 1px solid, border-radius 3px, opacity 0.4 disabled) : tous les composants avec des actions → **20+ fichiers**
- **Mono text block** (JetBrains Mono, pre-wrap, break-word, line-height 1.6) : ArtifactViewer, AgentConsole, DiagramViewer, FullPlanView, ContextViewer, PromptUsage → **6+ fichiers**
- **Workflow buttons** `.wf-btn/.wf-active/.wf-secondary/.wf-disabled` : WorkflowBar (source), PatchViewer, PushMergePanel → **3 fichiers** — copier-collé
- **Couleurs status sans variable CSS** (`#6a50c0`/`#a78bfa` running, `#16a34a`/`#4ade80` done, `#dc2626`/`#f87171` error) : FullPlanView, IssueGroupCard, DiagramViewer → **3+ fichiers** — définir `--color-status-running`, `--color-status-done`, `--color-status-error` dans le thème

---

## Candidats jgr-ui (par ordre de priorité)

1. **JgrScrollable** — wrapper `overflow-y: auto` avec scrollbar webkit 4px stylée — remplace `.content`, `.dv-tree`, `.result-list`, `.plan-content`, `.eval-result`, `.cv-scroll`, `.mv-list` dans **8+ fichiers** — props : `maxHeight?`, `class?`

2. **JgrPanelHeader** — barre d'en-tête uppercase avec border-bottom, slots left/right — remplace `.panel-header`, `.section-header`, `.groups-header`, `.fp-step-header` dans **10+ fichiers** — props : `label`, `icon?`

3. **JgrStatusBadge** — badge coloré par statut (running/done/error/idle + extensible) — remplace `.fp-dag-badge-*`, `.done-badge`, `.twin-badge` dans **5+ fichiers** — props : `status: string`, `label?`

4. **JgrCollapsible** — panneau repliable avec toggle header (icon + label + meta) — remplace `.dbg-panel`/`.dbg-toggle` dans ArtifactViewer, `.eval-panel` dans IssueGroupCard, les sections dans DiagramViewer — props : `label`, `meta?`, `defaultOpen?: boolean`

5. **JgrTabBar** — barre d'onglets horizontale scrollable sans scrollbar visible, tabs avec count et variante couleur — remplace `.todos-header`/`.tab`/`.tab-active` dans AgentConsole, `.panel-tabs`/`.tab` dans PlanPanel — props : `tabs: { id, label, count?, variant? }[]`, `active`

6. **JgrGhostBtn** (ou extension de JgrBtn) — bouton transparent avec border, hover accent, disabled state standardisé — remplace les dizaines de définitions bouton inline dans **tous les composants** — props : `variant: 'default'|'danger'|'success'|'accent'`, `disabled`, `size: 'sm'|'md'`

7. **JgrMonoText** — bloc texte monospace (JetBrains Mono, pre-wrap, line-height 1.6) — remplace `.plan`, `.body-text`, `.exp-content`, `.dv-pre`, `.result-code-inline` dans **6+ fichiers** — props : `size?: string`, `color?: string`