# Plan global — Issue #80 : Colonne Tasks

## Contexte

Issue #80 : restructuration de l'interface en deux colonnes latérales.

Sub-issues :
- #78 — Création/édition issues en haut
- #79 — Champ recherche dans colonne issues

---

## Objectif

1. Fusionner les deux colonnes latérales en une seule colonne **PROJET** (gauche)
2. Créer une nouvelle colonne **PLAN** (droite) visualisant la roadmap par onglets
3. Permettre de récupérer le contenu complet des sub-issues pour une demande de plan global

---

## Architecture cible

```
LEFT PROJET                CENTER                  RIGHT PLAN
┌─────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ onglet: TODO    │   │ roadmap / plan   │   │ onglet: task     │
│ onglet: ISSUES  │   │────────────────  │   │ onglet: étape    │
│ onglet: TASKS   │   │ AgentConsole     │   │ onglet: étapes   │
└─────────────────┘   └──────────────────┘   └──────────────────┘
```

---

## Étapes

### Étape 1 — Modifier `/api/issue` pour retourner le body des sub-issues

Fichier : `src/routes/api/issue/+server.ts`

Actuellement `getSubIssues` retourne `{ number, title, state }`.
On doit aussi retourner `body` pour pouvoir construire le prompt global.

**Patch :**
```diff
-        subIssues: subIssues.map(s => ({
-            number: s.number,
-            title: s.title,
-            state: s.state
-        }))
+        subIssues: subIssues.map(s => ({
+            number: s.number,
+            title: s.title,
+            body: s.body ?? "",
+            state: s.state
+        }))
```

### Étape 2 — Créer `ProjetPanel.svelte` (fusion IssuesTodoPanel + TaskList)

Fichier : `src/lib/components/ProjetPanel.svelte`

Nouveau composant avec 3 onglets :
- `todos` → `<TodoList hideHeader={true} />`
- `issues` → `<IssueList hideHeader={true} />` + bouton "Plan global" si sub-issues présentes
- `tasks` → `<TaskList />`

Le bouton **+** de création d'issue reste sur l'onglet `issues`.

### Étape 3 — Créer `PlanPanel.svelte` (nouvelle colonne droite)

Fichier : `src/lib/components/PlanPanel.svelte`

3 onglets dérivés des stores existants :
- `task` : affiche `$planModeTask` (titre, issueNumber, status)
- `étape` : affiche le groupe actif de `$planGroups` (liste des issues du groupe)
- `étapes` : affiche tous les `$planGroups` (liste cliquable)

Store supplémentaire à ajouter dans `agent.ts` :
```ts
export const activePlanGroupIndex = writable<number>(0);
```

### Étape 4 — Modifier `+page.svelte`

Remplacer :
- `<aside>` contenant `ArtifactViewer + IssuesTodoPanel` → garder `ArtifactViewer` dans `<aside>` et remplacer `IssuesTodoPanel` par `ProjetPanel`
- `<section>` contenant `<TaskList />` → remplacer par `<PlanPanel />`
- Label strip gauche : `ISSUES` → `PROJET`
- Label strip droit : `TASKS` → `PLAN`

### Étape 5 — Bouton "Plan global" dans IssueList

Quand une issue est sélectionnée et a des sub-issues, afficher un bouton **"Plan global"** qui :
1. Fait `GET /api/issue?number=N` pour récupérer body de l'issue parente + bodies des sub-issues
2. Construit un prompt combiné :
   ```
   ISSUES À PLANIFIER

   #80 — Colonne Tasks
   <body de #80>

   #79 — Champ recherche dans colonne issues
   <body de #79>

   #78 — Création/édition issues en haut
   <body de #78>
   ```
3. Lance `agentState` avec ce prompt → déclenche la planification globale

---

## Fichiers modifiés

| Fichier | Action |
|---------|--------|
| `src/routes/api/issue/+server.ts` | Ajouter `body` aux sub-issues |
| `src/lib/components/ProjetPanel.svelte` | Créer (fusion IssuesTodoPanel + onglet Tasks) |
| `src/lib/components/PlanPanel.svelte` | Créer (colonne PLAN avec onglets roadmap) |
| `src/lib/stores/agent.ts` | Ajouter `activePlanGroupIndex` |
| `src/routes/+page.svelte` | Adapter layout, importer nouveaux composants |
| `src/lib/components/IssueList.svelte` | Ajouter bouton "Plan global" |

---

## Ce qui NE change PAS

- `AgentInput.svelte` — reste dans le centre
- `IssueAnalysis.svelte` — reste dans le centre
- `AgentConsole.svelte` — reste dans le centre
- `ArtifactViewer.svelte` — reste dans l'aside gauche (au-dessus de ProjetPanel)
- Toutes les routes API sauf `/api/issue`
