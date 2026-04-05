Je vais lire les composants représentatifs de chaque groupe pour proposer des interfaces précises.
J'ai suffisamment de données pour faire l'analyse complète. Voici le rapport.

---

## Hiérarchie proposée

```
src/lib/components/
  shell/        # coquilles structurelles : panel, stepper, header, drawer
  viewers/      # affichage read-only : code, diff, arbre, symboles
  consoles/     # streaming logs + status bar
  actions/      # panels d'actions workflow (commit, push, patch)
  issues/       # composants liés aux issues GitHub
  tasks/        # composants liés aux tasks Claudicator
  agent/        # orchestration agent Claude
  plan/         # (existant — plan tabs)
```

**Mapping complet fichier → dossier**

| Fichier | Dossier cible |
|---|---|
| `GlobalPlanView.svelte` | `shell/` |
| `TaskPlanPanel.svelte` | `shell/` |
| `ConsoleDrawer.svelte` | `shell/` |
| `TopBar.svelte` | `shell/` |
| `WorkflowBar.svelte` | `shell/` |
| `MethodsViewer.svelte` | `viewers/` |
| `DiagramViewer.svelte` | `viewers/` |
| `ContextViewer.svelte` | `viewers/` |
| `SymbolsView.svelte` | `viewers/` |
| `ArchiView.svelte` | `viewers/` |
| `DiffView.svelte` | `viewers/` |
| `FileCodeView.svelte` | `viewers/` |
| `ClusterCodeView.svelte` | `viewers/` |
| `CoalCodeView.svelte` | `viewers/` |
| `FileTree.svelte` | `viewers/` |
| `MermaidDiagram.svelte` | `viewers/` |
| `ArtifactViewer.svelte` | `viewers/` |
| `RunConsole.svelte` | `consoles/` |
| `CssAnalysis.svelte` | `consoles/` |
| `ComponentAnalysis.svelte` | `consoles/` |
| `PlanBatchConsole.svelte` | `consoles/` |
| `RoadmapChat.svelte` | `consoles/` |
| `PromptUsage.svelte` | `consoles/` |
| `CommitPanel.svelte` | `actions/` |
| `PushMergePanel.svelte` | `actions/` |
| `PatchViewer.svelte` | `actions/` |
| `ImplementPanel.svelte` | `actions/` |
| `IssueChip.svelte` | `issues/` |
| `IssueGroups.svelte` | `issues/` |
| `IssueGroupCard.svelte` | `issues/` |
| `IssueAnalysis.svelte` | `issues/` |
| `FullPlanIssueTree.svelte` | `issues/` |
| `TaskList.svelte` | `tasks/` |
| `TaskDetail.svelte` | `tasks/` |
| `AgentConsole.svelte` | `agent/` |
| `AgentInput.svelte` | `agent/` |
| `ProjectSettings.svelte` | `shell/` |
| `ProjetPanel.svelte` | `shell/` |
| `FullPlanView.svelte` | `agent/` |
| `RoadmapViz.svelte` | `agent/` |
| `plan/PlanPanel.svelte` | `plan/` (inchangé) |
| `plan/PlanTabClusters.svelte` | `plan/` |
| `plan/PlanTabStep.svelte` | `plan/` |
| `plan/PlanTabHistory.svelte` | `plan/` |
| `plan/PlanTabSkills.svelte` | `plan/` |
| `plan/PlanTabSteps.svelte` | `plan/` |

---

## Candidats jgr-ui (par priorité)

### 1. JgrPanel ⭐ priorité critique
- **Remplace :** `GlobalPlanView`, `FullPlanView` (shell), `TaskPlanPanel`
- **Pattern :** `flex-column + height:100%` avec header fixe (`border-bottom + bg-panel`), zone scroll (`flex:1 + overflow-y:auto`) et footer fixe (`border-top`)
- **Props suggérées :**
  ```ts
  title?: string
  closable?: boolean
  onclose?: () => void
  header?: Snippet       // override complet du header
  footer?: Snippet
  children: Snippet
  ```
- **Impact :** 3 composants réduits à leur logique métier pure. `GlobalPlanView` passerait de 111 à ~30 lignes.

### 2. JgrSectionHeader ⭐ priorité critique
- **Remplace :** la structure répétée dans `MethodsViewer` (`.mv-header`), `ContextViewer` (`.cv-header`), `SymbolsView`, `FileCodeView`, `ClusterCodeView`, `DiagramViewer`, `IssueGroups`, `TaskList` (`.panel-header`)
- **Pattern :** `flex + align-items:center`, label uppercase monospace 0.58rem, badge count italic, slot actions droite
- **Props suggérées :**
  ```ts
  label: string
  badge?: string | number
  state?: 'idle' | 'loading' | 'error'
  actions?: Snippet
  ```
- **Impact :** ~8 composants allégés de 8–12 lignes chacun + uniformisation visuelle

### 3. JgrDiffView ⭐ priorité haute
- **Remplace :** `DiffView.svelte` (60 lignes, zéro couplage)
- **Pattern :** `diff-view` = liste de lignes colorées par préfixe (`+`=vert, `-`=rouge, `@@`=violet, `diff/index/---/+++`=meta)
- **Props suggérées :**
  ```ts
  content: string
  loading?: boolean
  loadingText?: string
  emptyText?: string
  maxHeight?: string     // default "320px"
  ```
- **Impact :** `CommitPanel`, `PatchViewer` — migration directe sans modification de logique

### 4. JgrLogPanel — priorité haute
- **Remplace :** `CssAnalysis.svelte` et `ComponentAnalysis.svelte` — **structure CSS quasi identique** (`wrap/status/spin/logs/log-line/header`)
- **Pattern :** header titre + spinner braille + zone scroll de lignes de log + barre de status basse
- **Props suggérées :**
  ```ts
  title: string
  logs: string[]
  running: boolean
  status?: string
  spinner?: string        // frames braille (défaut)
  header?: Snippet        // actions CTA (bouton démarrer)
  footer?: Snippet
  ```
- **Impact :** 2 composants qui sont aujourd'hui des quasi-copies deviennent identiques structurellement

### 5. JgrFileTree
- **Remplace :** `FileTree.svelte` (94 lignes, zéro couplage)
- **Pattern :** arbre collapsible récursif avec snippet `renderNode`, dirs avant files, indent par depth
- **Props suggérées :**
  ```ts
  paths: string[]
  onselect?: (path: string) => void   // optionnel pour rendre interactif
  ```
- **Impact :** `ArchiView` — migration directe

### 6. JgrStepper
- **Remplace :** shell de `WorkflowBar.svelte`
- **Pattern :** flex horizontal, boutons séparés par `›` (`.wf-arrow`), états active/secondary/disabled
- **Props suggérées :**
  ```ts
  steps: Array<{
    label: string
    state: 'active' | 'secondary' | 'disabled'
    onclick?: () => void
  }>
  ```
- **Impact :** `WorkflowBar` réduit à la logique de calcul des états (`btnVariant`)

### 7. JgrMasterDetail
- **Remplace :** le shell de `MethodsViewer.svelte`
- **Pattern :** liste items 160px à gauche (`border-right`), zone contenu `flex:1` à droite, header de fichier hint au-dessus du détail
- **Props suggérées :**
  ```ts
  items: Array<{ id: string; group?: string; label: string; meta?: string }>
  selected?: string
  onselect: (id: string) => void
  detail: Snippet         // zone droite
  emptyDetail?: Snippet
  ```
- **Impact :** `MethodsViewer` allégé du CSS shell (~120 lignes), logique Monaco reste

---

## Composants à scinder (domaine + coquille générique)

### IssueChip.svelte
- **Shell à extraire :** bouton chip avec variants (`default`, `hist`, struck), styles monospace, couleurs par variant
- **Logique métier à garder :** `fetch('/api/issue?number=...')` + `agentState.update(...)` dans un wrapper `IssueChip.svelte` qui passe `onclick` au JgrChip

### WorkflowBar.svelte
- **Shell à extraire :** → `JgrStepper` (voir ci-dessus)
- **Logique métier à garder :** `btnVariant(step, currentStep)` + mapping vers les panels Claudicator (`"plan"`, `"implement"`, `"commit"`, `"push"`)

### TopBar.svelte (423l)
- **Shell à extraire :** header flex (`left/center/right`), select stylé, indicateurs loading/error
- **Logique métier à garder :** fetch projets, changement de projet actif, ouverture `ProjectSettings`

### ConsoleDrawer.svelte (533l)
- **Shell à extraire :** panneau résizable verticalement (drag handle, `PANEL_HEIGHT_KEY`, clamp), spinner braille
- **Logique métier à garder :** connexion à `agentRunState`, barre de complétion, input follow-up

---

## Composants déjà agnostiques (prêts pour jgr-ui)

| Composant | Raison | Notes |
|---|---|---|
| `DiffView.svelte` | Props only, zéro import store/métier | Migration directe |
| `FileTree.svelte` | Props `paths[]`, logique d'arbre pure | Migration directe |
| `PromptUsage.svelte` | Affichage stats tokens — types internes simples | Typer les props génériquement |

---

## Observations transversales

**Svelte 4 → 5 runes non migrés :** `ContextViewer`, `MethodsViewer`, `IssueChip` utilisent encore `$:` et `export let`. À migrer vers `$state`/`$derived`/`$props()` avant extraction.

**CssAnalysis vs ComponentAnalysis :** ces deux fichiers sont structurellement identiques (même classes CSS, même pattern SSE, même spinner). Avant d'extraire `JgrLogPanel`, fusionner leur CSS dans un seul composant paramétré est la voie la plus rapide.

**JgrConsole existe déjà** — `RunConsole` l'utilise correctement. `RoadmapChat` et `PlanBatchConsole` s'en rapprochent mais n'y ont pas migré : vérifier si `JgrConsole` peut absorber leurs cas d'usage.