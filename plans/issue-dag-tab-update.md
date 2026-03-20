# Plan : Correction de la mise à jour du DAG selon l'onglet actif

## 1. Analyse du problème

### Symptôme
Le graphe DAG ne se met à jour qu'une seule fois au changement d'onglet (Tasks → Steps fonctionne, puis plus rien).

### Cause racine : boucle réactive cyclique

Le flux actuel crée un cycle fermé :

```
activeTab change
    ↓
$effect (JgrRoadmap.svelte:191) s'exécute
    ↓
untrack(() => tabs) → lit les tabs depuis la roadmap FILTRÉE
    ↓
ontabchange(tabIssues) appelé
    ↓
roadmapTabIssues.set(tabIssues)  [RoadmapViz.svelte:75]
    ↓
dagIssueFilter recalcule  [agent.ts:148]
    ↓
filteredRoadmap recalcule  [RoadmapViz.svelte:26]
    ↓
JgrRoadmap reçoit une nouvelle prop roadmap
    ↓
tabs se re-dérive depuis la roadmap filtrée
    ↓
← activeTab n'a pas changé → l'effet NE re-tourne PAS
```

### Pourquoi ça marche une fois, puis s'arrête

Au départ, `roadmapTabIssues = []` → `filteredRoadmap = roadmap complète`.

Quand l'utilisateur clique Steps :
1. L'effet lit `tabs` (depuis la roadmap COMPLÈTE via `untrack`)
2. Calcule les issues du tab Steps → filtre appliqué
3. `filteredRoadmap` change → `tabs` se re-dérive sur la roadmap FILTRÉE

Quand l'utilisateur clique Étapes :
1. L'effet lit `tabs` (depuis la roadmap FILTRÉE cette fois)
2. Les `tabIssues` calculés sont un sous-ensemble ou identiques → filtre inchangé
3. `filteredRoadmap` ne change pas → **le DAG ne bouge pas**

### Problème fondamental
`JgrRoadmap` reçoit une `roadmap` déjà filtrée par le tab précédent.
Le calcul de `tabs` (servant à notifier le parent) est donc erroné dès le 2e changement.

---

## 2. Localisation des usages

| Fichier | Ligne | Rôle dans le bug |
|---------|-------|-----------------|
| `C:/jgr-ui/src/lib/components/JgrRoadmap.svelte` | 148–182 | `tabs = $derived.by(...)` depuis la prop `roadmap` filtrée |
| `C:/jgr-ui/src/lib/components/JgrRoadmap.svelte` | 191–198 | `$effect` qui lit `tabs` via `untrack` et appelle `ontabchange` |
| `C:/jgr-ui/src/lib/components/JgrDag.svelte` | 193 | Reçoit `{roadmap}` pour l'affichage SVG |
| `src/lib/components/RoadmapViz.svelte` | 26 | `filteredRoadmap = $derived(filterRoadmapByIssues(roadmap, $dagIssueFilter))` |
| `src/lib/components/RoadmapViz.svelte` | 71 | Passe `roadmap={filteredRoadmap}` à JgrRoadmap |
| `src/lib/components/RoadmapViz.svelte` | 75 | `ontabchange` → `roadmapTabIssues.set(issues)` |
| `src/lib/stores/agent.ts` | 145–154 | Stores `roadmapTabIssues`, `roadmapSelectedIssues`, `dagIssueFilter` |

---

## 3. Stratégie de remplacement

### Principe : internaliser le filtrage dans JgrRoadmap

Actuellement le filtrage est **externe** (RoadmapViz filtre avant de passer à JgrRoadmap), ce qui crée la boucle.

La solution : **déplacer le filtrage à l'intérieur de JgrRoadmap**.

```
AVANT (cycle externe) :
  filteredRoadmap (RoadmapViz) → roadmap prop → JgrRoadmap → tabs → ontabchange → dagIssueFilter → filteredRoadmap (cycle!)

APRÈS (filtrage interne) :
  roadmap complète → JgrRoadmap → tabs (depuis roadmap complète, stable)
                                 → dagRoadmap = $derived (filtré par activeTab)
                                 → JgrDag reçoit dagRoadmap
```

### Avantages
- `tabs` est toujours calculé depuis la roadmap complète → stable, sans cycle
- Chaque changement d'onglet produit les bonnes issues depuis la liste complète
- `ontabchange` reste utile pour la synchronisation externe (sans provoquer de cycle)

---

## 4. Étapes de modification du code

### Étape 1 — `JgrRoadmap.svelte` : ajouter `dagRoadmap` dérivé

Dans la section `<script>`, après la définition de `tabs`, ajouter :

```typescript
// Roadmap filtrée pour l'affichage dans JgrDag
// On filtre depuis la roadmap COMPLÈTE selon l'onglet actif ou la sélection
const dagRoadmap = $derived.by((): RoadmapData | undefined => {
  if (!roadmap) return undefined;

  // Sélection manuelle d'un item : filtrer sur ses steps
  if (selectedItemId !== null) {
    const stepIds = new Set(itemSteps.get(selectedItemId) ?? []);
    const filtered = roadmap.steps.filter(s => stepIds.has(s.id));
    const keptIds = new Set(filtered.map(s => s.id));
    return {
      ...roadmap,
      steps: filtered.map(s => ({
        ...s,
        dependsOnSteps: s.dependsOnSteps.filter(id => keptIds.has(id)),
      })),
      stats: { ...roadmap.stats, steps: filtered.length },
    };
  }

  // Sinon : filtrer selon les issues du tab actif
  const currentTab = tabs.find(t => t.id === activeTab);
  const tabIssues = [...new Set((currentTab?.items ?? []).flatMap(item => item.issues ?? []))];
  if (tabIssues.length === 0) return roadmap; // Pas d'issues → tout afficher

  const set = new Set(tabIssues);
  const filtered = roadmap.steps.filter(s => s.issues?.some(n => set.has(n)));
  const keptIds = new Set(filtered.map(s => s.id));
  return {
    ...roadmap,
    steps: filtered.map(s => ({
      ...s,
      dependsOnSteps: s.dependsOnSteps.filter(id => keptIds.has(id)),
    })),
    stats: { ...roadmap.stats, steps: filtered.length },
  };
});
```

### Étape 2 — `JgrRoadmap.svelte` : utiliser `dagRoadmap` dans le template

Dans le snippet `{#snippet center()}`, remplacer :
```svelte
<JgrDag {roadmap} {activeIds} />
```
par :
```svelte
<JgrDag roadmap={dagRoadmap!} {activeIds} />
```

### Étape 3 — `JgrRoadmap.svelte` : simplifier le `$effect`

L'`untrack` était nécessaire pour éviter que `tabs` déclenche le cycle.
Avec la nouvelle architecture, ce n'est plus un problème — mais on peut le garder par précaution.

Vérifier que l'effet reste identique (aucun changement nécessaire, mais à documenter) :

```typescript
$effect(() => {
  void activeTab; // seule dépendance voulue
  selectedItemId = null;
  activeIds = [];
  const currentTab = untrack(() => tabs).find(t => t.id === activeTab);
  const tabIssues = [...new Set((currentTab?.items ?? []).flatMap((item: any) => item.issues ?? []))];
  ontabchange?.(tabIssues);
});
```

> Note : avec la roadmap complète, `tabs` ne change plus quand `ontabchange` est appelé.
> L'`untrack` devient défensif mais n'est plus critique.

### Étape 4 — `RoadmapViz.svelte` : passer la roadmap complète

Remplacer :
```svelte
<JgrRoadmap
    roadmap={filteredRoadmap}
    ...
/>
```
par :
```svelte
<JgrRoadmap
    roadmap={roadmap}
    ...
/>
```

Et supprimer la dérivation `filteredRoadmap` (ligne 26) qui n'est plus utilisée.

### Étape 5 — `RoadmapViz.svelte` : simplifier les callbacks si besoin

Le callback `ontabchange` reste utile si d'autres composants s'appuient sur `dagIssueFilter`.
Si rien d'autre ne l'utilise, on peut aussi le simplifier.

**À vérifier** : est-ce que `dagIssueFilter` est utilisé ailleurs que dans RoadmapViz ?
- Grep : `dagIssueFilter` dans `src/`

### Étape 6 — `agent.ts` : nettoyage optionnel

Si `dagIssueFilter`, `roadmapTabIssues` et `roadmapSelectedIssues` ne sont plus utilisés après les changements ci-dessus, les supprimer.

---

## 5. Vérifications et nettoyage final

### Tests de comportement

| Scénario | Résultat attendu |
|----------|-----------------|
| Démarrer sur Tasks | DAG affiche uniquement les steps liés à des issues |
| Cliquer Steps | DAG affiche tous les steps |
| Cliquer Étapes | DAG affiche les steps filtrés par concept (identique à Steps en contenu) |
| Cliquer Dossiers | DAG affiche les steps groupés par dossier |
| Cliquer Domaines | DAG affiche les steps groupés par domaine |
| Retour Tasks | DAG revient aux steps liés à des issues |
| Sélectionner un item dans la liste | DAG highlight les steps de cet item uniquement |
| Désélectionner | DAG revient au filtre du tab |

### Vérifications régressions

- [ ] `npm run package` dans `jgr-ui` après modification
- [ ] Le composant `JgrRoadmap` fonctionne toujours avec une roadmap `undefined`
- [ ] Les types TypeScript sont satisfaits (`dagRoadmap!` vs `dagRoadmap`)
- [ ] `onissuefilter` fonctionne toujours (sélection manuelle d'items)
- [ ] Le pan/zoom du DAG (`JgrDag`) n'est pas affecté
- [ ] Le bouton "Régénérer" fonctionne toujours

### Fichiers modifiés

1. `C:/jgr-ui/src/lib/components/JgrRoadmap.svelte` — ajout `dagRoadmap`, modification template
2. `C:/claudicator/src/lib/components/RoadmapViz.svelte` — passer `roadmap` complet, supprimer `filteredRoadmap`
3. `C:/claudicator/src/lib/stores/agent.ts` — nettoyage optionnel si stores inutilisés

### Publication

Après validation, `npm run package` dans `C:/jgr-ui` suffit (symlink actif).
