Maintenant vérifions les usages des stores avant de nettoyer.
Les stores ne sont utilisés que dans `RoadmapViz.svelte`. Parfait, on peut tout nettoyer.
Tout est clair. Voici les 3 modifications :

**Étape 1 — `JgrRoadmap.svelte` : ajouter `dagRoadmap` et l'utiliser dans le template**
**Étape 2 — Utiliser `dagRoadmap` dans le template**
**Étape 3 — `RoadmapViz.svelte` : passer `roadmap` complet, supprimer le filtrage externe**
**Étape 4 — Supprimer les stores inutilisés dans `agent.ts`**
Maintenant vérifions que `derived` n'est plus utilisé uniquement pour ces stores supprimés (pour éviter un import inutile) :
`derived` est encore utilisé ailleurs. Maintenant `npm run package` dans `jgr-ui` :
Build propre. Voici le résumé de ce qui a été fait :

**`JgrRoadmap.svelte`**
- Ajout de `dagRoadmap = $derived.by(...)` qui filtre depuis la roadmap **complète** selon `activeTab` ou `selectedItemId`
- `JgrDag` reçoit maintenant `dagRoadmap` au lieu de `roadmap`
- `tabs` reste calculé depuis la roadmap complète → stable, sans cycle

**`RoadmapViz.svelte`**
- Passe `{roadmap}` (non filtré) à `JgrRoadmap`
- Suppression de `filterRoadmapByIssues`, `filteredRoadmap`, et des callbacks `onissuefilter`/`ontabchange`

**`agent.ts`**
- Suppression de `roadmapSelectedIssues`, `roadmapTabIssues`, `dagIssueFilter` (plus utilisés)

Le cycle réactif est cassé : `tabs` ne dépend plus de la roadmap filtrée, donc chaque changement d'onglet produit toujours le bon filtre depuis la liste complète.