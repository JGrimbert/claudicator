Le fichier PlanPanel.svelte est trop grand. Cherchons la section CLUSTERS.
Cherchons si `planGroups` sont utilisés dans l'onglet clusters.
Regardons la route clusters pour comprendre les données.
Je dois comprendre la structure de `PlanGroup` dans le store.
Maintenant trouvons la fin du CSS pour ajouter les nouvelles classes.
Je vais maintenant trouver où ajouter la fonction helper dans le script.
J'ai tout ce qu'il me faut. Voici les changements à faire :

1. Ajouter `groupIssuesByPlanGroup` dans le script
2. Modifier le rendu des issues dans COALESCENCE
3. Modifier le rendu des issues dans PAR DOSSIER
4. Ajouter le CSS
Maintenant le rendu COALESCENCE :
Maintenant PAR DOSSIER :
Maintenant le CSS après `.coal-sub-count` :
Vérifions que les changements sont corrects en relisant les sections modifiées.
Les changements sont en place. Voici ce qui a été modifié :

**Fonction `groupIssuesByPlanGroup`** — prend une liste de numéros d'issues et les groupe par `planGroup` (depuis le store `$planGroups`). Les issues sans groupe vont dans "autres".

**COALESCENCE et PAR DOSSIER** — quand les issues d'un slot appartiennent à plusieurs plan groups :
- Affiche des `slot-stack-box` avec bordure `dashed` colorée (`--stack-hue` rotatif, même formule que les `stack-box` de GROUPES)
- En-tête = nom du plan group + compteur
- Fallback : affichage `dir-issues` plat si une seule catégorie (ou pas de roadmap chargée)

**Condition d'activation** : si `$planGroups` est vide (aucune roadmap chargée), `slotGroups.length` sera 1 → affichage plat inchangé.