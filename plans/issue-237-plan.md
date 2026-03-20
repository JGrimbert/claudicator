Maintenant je comprends tout. Je vais implémenter le fix :
Maintenant le template :
Maintenant le CSS pour le bouton :
Maintenant le panneau gauche doit aussi avoir son label correct — vérifions qu'il l'a déjà :
C'est bon. Vérifions la section script finale :
C'est propre. Voici ce qui a changé :

**Avant** : panneau droit = toujours `buildClusterRoadmap`, indépendant de l'onglet actif.

**Après** :
- Par défaut (`mirror`) : panneau droit = même DAG que le gauche, même sélection `activeIds`
- Toggle `⊜`/`◎` en haut à droite du panneau : bascule vers la vue Clusters fixe (comportement précédent)
- En mode `clusters`, la sélection du droit suit les cluster-IDs (logique `clusterActiveIds` intégrée dans `rightActiveIds`)
- Le label du panneau droit reflète l'onglet actif en mode miroir, ou "Clusters" en mode fixe