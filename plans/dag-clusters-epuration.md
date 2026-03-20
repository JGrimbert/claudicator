# Plan — DAG Roadmap : Clusters + Épuration des nœuds isolés

**Date :** 2026-03-20
**Fichiers principaux :** `jgr-ui/src/lib/components/JgrRoadmap.svelte`, `jgr-ui/src/lib/components/JgrDag.svelte`, `claudicator/src/lib/components/RoadmapViz.svelte`

---

## 1. Analyse du problème

### 1.1 Remplacement étapes / dossiers / domaines → clusters

Le panel latéral de `JgrRoadmap.svelte` expose actuellement 5 onglets :

| Onglet | Id | Contenu |
|---|---|---|
| Tasks | `tasks` | 1 item par couple (step, issue) |
| Steps | `steps` | 1 item par step |
| Étapes | `etapes` | groupement `depth=0` (coalNodeId/concept) |
| Dossiers | `dossiers` | groupement `depth=1` (dossier parent) |
| Domaines | `domaines` | groupement `depth=2` (skill) |

Les 3 derniers doivent être supprimés et remplacés par un onglet **Clusters** qui affiche les groupes issus de `/api/issues/groups` (même source que l'onglet GROUPES).

### 1.2 Épuration du DAG (nœuds isolés)

Dans `JgrDag.svelte`, le calcul de niveau place tous les nœuds sans `dependsOnSteps` au niveau L0. Parmi eux, certains ne sont référencés par aucun autre nœud (personne ne dépend d'eux). Ces nœuds **isolés** (zéro arête entrante + zéro arête sortante) gonflent inutilement la ligne L0 et allongent le diagramme verticalement.

**Critère de filtre :** un nœud est *isolé* si :
- `step.dependsOnSteps.length === 0` (il est à L0)
- ET aucun autre step n'a ce nœud dans ses `dependsOnSteps`

Ces nœuds ne participent à aucune chaîne de dépendance → ils peuvent être masqués.

---

## 2. Localisation des usages

### JgrRoadmap.svelte (`C:/jgr-ui/src/lib/components/JgrRoadmap.svelte`)

| Ligne | Usage |
|---|---|
| 120–165 | `buildGroupRoadmap(steps, depth)` — construit le DAG synthétique pour étapes/dossiers/domaines |
| 168–194 | `buildStackItems(steps, depth)` — construit les items de liste pour ces 3 onglets |
| 278–285 | Tableau `tabs` : déclaration des 5 onglets (dont etapes, dossiers, domaines) |
| 317–321 | `dagRoadmap` : branche `depth = activeTab === 'etapes' ? 0 : ...` |
| 197–223 | `itemSteps` map : boucle `for depth of [0, 1, 2]` pour les 3 onglets |

### JgrDag.svelte (`C:/jgr-ui/src/lib/components/JgrDag.svelte`)

| Ligne | Usage |
|---|---|
| 34–53 | `levelMap` — calcule le niveau de chaque step (itère sur `roadmap.steps`) |
| 56–72 | `posMap` — calcule les positions x/y (itère sur `levelMap`) |
| 90–94 | `edges` — construit les arêtes (itère sur `roadmap.steps`) |
| 193–216 | Template SVG nœuds — itère sur `roadmap.steps` |
| 219–232 | Template SVG labels — itère sur `roadmap.steps` |

### RoadmapViz.svelte (`C:/claudicator/src/lib/components/RoadmapViz.svelte`)

| Ligne | Usage |
|---|---|
| 1–75 | Composant wrapper — charge `/api/roadmap-data`, passe `roadmap` à `JgrRoadmap` |
| 78–83 | `<JgrRoadmap {roadmap} {status} onRegenerate={generate} onissueclick={handleIssueClick} />` |

---

## 3. Stratégie de remplacement

### 3.1 Clusters

**Approche choisie : prop `clusters` passé depuis RoadmapViz**

`JgrRoadmap` est une bibliothèque (`jgr-ui`) — il ne faut pas lui faire appeler une API directement. La donnée est chargée dans `RoadmapViz.svelte` (déjà côté application) et passée en prop.

**Type à ajouter dans JgrRoadmap :**
```typescript
export type IssueCluster = {
  keyword: string;
  keywords: string[];
  issues: number[];          // numéros d'issues (pas d'objets)
  score: number;
  hasParent: boolean;
};
```

> Note : `/api/issues/groups` retourne `issues: { number, title }[]`. La conversion `issues.map(i => i.number)` se fait dans RoadmapViz avant de passer la prop.

**Construction de la liste (onglet Clusters) :**

Chaque cluster devient un `ListItem` :
```typescript
{
  id: `cluster-${keyword}`,
  label: keyword,
  prefix: String(issues.length),   // nb d'issues dans le cluster
  labels: keywords.slice(1).map(k => ({ name: k, color: '555566' })),
  issues: issues,                   // numéros d'issues
}
```

**Construction du DAG (onglet Clusters) — `buildClusterRoadmap()` :**

Chaque cluster devient un nœud synthétique. Les arêtes sont dérivées des dépendances entre les steps qui appartiennent aux clusters :
- Pour chaque step ayant des issues dans un cluster C, on l'assigne au cluster C (premier match)
- On dérive les dépendances inter-cluster depuis `step.dependsOnSteps`

**`itemSteps` map pour les clusters :**

```
map.set(`cluster-${keyword}`, stepIds_appartenant_au_cluster)
```

Un step appartient à un cluster si `step.issues?.some(n => cluster.issues.includes(n))`.

### 3.2 Épuration du DAG

**Approche choisie : filtre `visibleSteps` dans JgrDag**

On calcule d'abord l'ensemble des nœuds référencés par d'autres, puis on filtre les isolés.

```typescript
// Set des ids qui ont au moins un dépendant
const dependentSet = $derived.by(() => {
  const set = new Set<number>();
  for (const s of roadmap.steps)
    for (const dep of s.dependsOnSteps) set.add(dep);
  return set;
});

// Steps visibles : ceux qui ont au moins une arête (entrante OU sortante)
const visibleSteps = $derived(
  roadmap.steps.filter(s =>
    s.dependsOnSteps.length > 0 || dependentSet.has(s.id)
  )
);
```

Tous les `$derived` suivants (`levelMap`, `posMap`, `edges`, template SVG) utilisent `visibleSteps` au lieu de `roadmap.steps`.

---

## 4. Étapes de modification du code

### Étape A — `JgrRoadmap.svelte` (dans jgr-ui)

**A1.** Ajouter le type `IssueCluster` (export) après les types existants.

**A2.** Ajouter `clusters?: IssueCluster[]` dans la destructuration des props.

**A3.** Supprimer `buildGroupRoadmap` et `buildStackItems` (plus utilisés après suppression des 3 onglets).
> Vérifier qu'ils ne sont référencés nulle part ailleurs dans jgr-ui avant suppression.

**A4.** Ajouter `buildClusterRoadmap(steps, clusters)` :
```typescript
function buildClusterRoadmap(steps: RoadmapStep[], clusters: IssueCluster[]): RoadmapData {
  // Assigner chaque step à son premier cluster (par intersection d'issues)
  const stepToCluster = new Map<number, number>(); // stepId → index cluster
  clusters.forEach((c, ci) => {
    for (const s of steps) {
      if (!stepToCluster.has(s.id) && (s.issues ?? []).some(n => c.issues.includes(n)))
        stepToCluster.set(s.id, ci);
    }
  });

  // Construire les nœuds synthétiques
  const syntheticSteps: RoadmapStep[] = clusters.map((c, ci) => {
    const memberSteps = steps.filter(s => stepToCluster.get(s.id) === ci);
    const depClusters = new Set<number>();
    for (const s of memberSteps)
      for (const dep of s.dependsOnSteps) {
        const g = stepToCluster.get(dep);
        if (g !== undefined && g !== ci) depClusters.add(g);
      }
    return {
      id: ci,
      label: c.keyword,
      skill: dominantSkill(memberSteps.length ? memberSteps : [{ skill: 'internal' } as any]),
      concept: c.keyword,
      nodes: memberSteps.flatMap(s => s.nodes),
      files: memberSteps.flatMap(s => s.files),
      rationale: '',
      dependsOnSteps: [...depClusters],
      issues: c.issues,
    };
  });

  const edgeCount = syntheticSteps.reduce((n, s) => n + s.dependsOnSteps.length, 0);
  return {
    steps: syntheticSteps,
    spine: [],
    stats: { nodes: syntheticSteps.length, edges: edgeCount, levels: 0, steps: syntheticSteps.length },
  };
}
```

**A5.** Mettre à jour `tabs` (derived) :
- Supprimer les 3 entrées `etapes`, `dossiers`, `domaines`
- Ajouter l'entrée `clusters` :
```typescript
const clusterItems: ListItem[] = (clusters ?? []).map(c => ({
  id: `cluster-${c.keyword}`,
  label: c.keyword,
  prefix: String(c.issues.length),
  labels: c.keywords.slice(1).map(k => ({ name: k, color: '555566' })),
  issues: c.issues,
}));

// Tableau final :
return [
  { id: 'tasks',    label: 'Tasks',    items: taskItems,    empty: 'Aucun step lié à des issues' },
  { id: 'steps',    label: 'Steps',    items: stepItems,    empty: 'Aucun step' },
  { id: 'clusters', label: 'Clusters', items: clusterItems, empty: 'Aucun cluster détecté' },
];
```

**A6.** Mettre à jour `dagRoadmap` (derived) :
- Supprimer la branche `depth = activeTab === 'etapes' ? 0 : ...`
- Ajouter :
```typescript
if (activeTab === 'clusters') {
  return buildClusterRoadmap(issueSteps, clusters ?? []);
}
```

**A7.** Mettre à jour `itemSteps` map :
- Supprimer la boucle `for depth of [0, 1, 2]`
- Ajouter le bloc cluster :
```typescript
for (const c of (clusters ?? [])) {
  const clusterStepIds = steps
    .filter(s => (s.issues ?? []).some(n => c.issues.includes(n)))
    .map(s => s.id);
  map.set(`cluster-${c.keyword}`, clusterStepIds);
}
```

**A8.** (Optionnel) Mettre à jour `handleIssueClick` si nécessaire — vérifier que la logique de switch vers `tasks` fonctionne toujours.

---

### Étape B — `JgrDag.svelte` (dans jgr-ui)

**B1.** Après le `$derived` de `levelMap` (ligne 34), ajouter :

```typescript
// Nœuds qui ont au moins un dépendant (référencés dans un dependsOnSteps)
const dependentSet = $derived.by(() => {
  const set = new Set<number>();
  for (const s of roadmap.steps)
    for (const dep of s.dependsOnSteps) set.add(dep);
  return set;
});

// Nœuds visibles : au moins une arête (entrante OU sortante)
const visibleSteps = $derived(
  roadmap.steps.filter(s =>
    s.dependsOnSteps.length > 0 || dependentSet.has(s.id)
  )
);
```

**B2.** Remplacer dans `levelMap` : `for (const s of roadmap.steps)` → `for (const s of visibleSteps)`

**B3.** Dans `edges` : `roadmap.steps.flatMap(...)` → `visibleSteps.flatMap(...)`

**B4.** Dans le template SVG (nœuds + labels) : `{#each roadmap.steps as step}` → `{#each visibleSteps as step}`

> Note : `posMap` itère sur `levelMap` qui a déjà été filtré, pas de changement nécessaire.

---

### Étape C — `RoadmapViz.svelte` (dans claudicator)

**C1.** Ajouter import du type `IssueCluster` depuis `jgr-ui`.

**C2.** Ajouter une variable d'état `clusters` et un fetch au montage :
```typescript
let clusters: IssueCluster[] = $state([]);

onMount(async () => {
  // fetch existant de /api/roadmap-data ...

  // Chargement des clusters
  try {
    const r = await fetch('/api/issues/groups?min=3');
    if (r.ok) {
      const data = await r.json();
      clusters = (data.groups ?? []).map((g: any) => ({
        keyword: g.keyword,
        keywords: g.keywords ?? [g.keyword],
        issues: (g.issues ?? []).map((i: any) => i.number ?? i),
        score: g.score ?? 0,
        hasParent: g.hasParent ?? false,
      }));
    }
  } catch { /* ignore */ }
});
```

**C3.** Passer la prop à `JgrRoadmap` :
```svelte
<JgrRoadmap
  {roadmap}
  {clusters}
  {status}
  onRegenerate={generate}
  onissueclick={handleIssueClick}
/>
```

---

### Étape D — Rebuild et vérification

**D1.** Dans `C:/jgr-ui` : `npm run package` pour reconstruire la dist.

**D2.** Vérifier que le symlink dans claudicator pointe bien sur le dist mis à jour.

**D3.** Lancer `npm run dev` dans claudicator et vérifier dans l'UI :
- L'onglet ROADMAP DAG : 3 onglets visibles (Tasks, Steps, Clusters)
- L'onglet Clusters affiche la même liste que l'onglet GROUPES
- Le DAG en vue Clusters montre des nœuds synthétiques par cluster
- Le DAG en vue Tasks/Steps ne montre plus les nœuds isolés (L0 avec zéro arête)

---

## 5. Vérifications et nettoyage final

### Régressions à vérifier

| Test | Critère de succès |
|---|---|
| Onglet Tasks toujours fonctionnel | Items affichés, sélection → highlight dans DAG |
| Onglet Steps toujours fonctionnel | Idem |
| Onglet Clusters affiché | Liste de clusters avec nb d'issues, click → highlight steps associés |
| DAG Clusters | Nœuds synthétiques par cluster, arêtes cohérentes |
| Nœuds isolés filtrés | L0 ne contient plus les nœuds sans aucune arête |
| Nœuds avec dépendances toujours présents | Steps à L0 référencés par d'autres restent visibles |
| Click issue dans DAG | Ouvre l'issue dans le panel artefact |
| `activeTab` initial | Rester sur `tasks` par défaut (pas d'erreur si clusters vide) |
| Roadmap vide (`status='empty'`) | Pas d'erreur si `clusters=[]` et `roadmap=undefined` |

### Nettoyage

- Supprimer `buildGroupRoadmap` et `buildStackItems` de `JgrRoadmap.svelte` une fois les 3 onglets retirés
- Vérifier qu'aucun autre composant de `jgr-ui` n'importe ces fonctions

### Export du type

- Ajouter `IssueCluster` dans `C:/jgr-ui/src/lib/index.ts` si ce fichier exporte les types publics
