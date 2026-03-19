Maintenant regardons `RoadmapViz.svelte` pour comprendre la structure du panel DAG Roadmap et ses onglets de droite.
Je dois comprendre la structure complète du layout pour voir où se trouve la colonne droite du panel DAG.
Je dois voir ce que `JgrRoadmap` expose comme props pour comprendre les onglets de droite.
`jgr-ui` est un package local à `C:/jgr-ui`. La correction est claire :

1. Ajouter `ontabchange` à `JgrRoadmap` qui émet les issues du tab actif
2. Créer un store `roadmapTabIssues` dans `agent.ts`
3. Supprimer la dépendance à `projetPanelTab` de `dagIssueFilter`
4. Connecter tout dans `RoadmapViz.svelte`
Compris. La colonne droite du `JgrRoadmap` a ses propres onglets (Tasks/Steps/Étapes/Dossiers/Domaines). Quand on change d'onglet là, le DAG doit filtrer selon les issues de cet onglet — pas selon les onglets de `ProjetPanel` à gauche.

**Plan :**
1. Ajouter `ontabchange` à `JgrRoadmap` → émet les issues du tab actif
2. Nouveau store `roadmapTabIssues` dans `agent.ts`  
3. `dagIssueFilter` utilise `roadmapTabIssues` au lieu de `projetPanelTab`
4. `RoadmapViz.svelte` passe le handler `ontabchange`
Maintenant le store `roadmapTabIssues` et la mise à jour de `dagIssueFilter` :
Maintenant `RoadmapViz.svelte` :
Voilà. Les 3 changements :

- **`JgrRoadmap.svelte`** (jgr-ui) : nouvelle prop `ontabchange`, fire quand l'onglet change avec toutes les issues du tab courant
- **`agent.ts`** : nouveau store `roadmapTabIssues`, `dagIssueFilter` ne dépend plus de `projetPanelTab` — seulement de `roadmapSelectedIssues` (sélection item) et `roadmapTabIssues` (changement d'onglet)
- **`RoadmapViz.svelte`** : passe `ontabchange` qui met à jour `roadmapTabIssues` et reset la sélection

Comportement résultant :
- Changer d'onglet dans la colonne droite du DAG → filtre le graphe sur les issues du tab
- Cliquer un item → filtre sur les issues de cet item (prioritaire)
- Déselectionner → revient aux issues du tab actif
- Changer d'onglet dans `ProjetPanel` (gauche) → **aucun effet** sur le DAG