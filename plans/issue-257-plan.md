Maintenant je cherche le composant qui affiche les tâches avec le bouton merge.
Maintenant je vais voir comment les issues utilisent le spinner braille cornsilk.
Maintenant je cherche le store qui gère la liste des issues pour comprendre comment en supprimer une.
Maintenant je vérifie les imports actuels dans TaskList.svelte.
J'ai tout ce qu'il me faut. Voici les changements à faire dans `TaskList.svelte` :

1. Importer `issueListRefreshTick`
2. Ajouter les FRAMES braille + interval
3. Mettre à jour `mergeBranch` pour vider le plan panel, supprimer l'issue, et ajouter `planModeTask.set(null)`
4. Afficher le spinner braille cornsilk sur le bouton merge
Maintenant je mets à jour la fonction `mergeBranch` pour vider le plan et supprimer l'issue :
Maintenant je mets à jour le bouton merge pour afficher le spinner cornsilk :
Maintenant j'ajoute le style CSS pour la classe `merging-spin` (couleur cornsilk) dans la section `<style>` :
Voici un récapitulatif des changements effectués dans `TaskList.svelte` :

**1. Spinner braille cornsilk** (lignes ~103-107)
- Ajout de `FRAMES`, `frame`, `spinnerInterval`
- Démarrage de l'interval dans `onMount`, arrêt dans `onDestroy`

**2. Bouton merge** — affiche `FRAMES[frame]` pendant `merging` avec la classe `.merging-spin` (color: cornsilk)

**3. Fonction `mergeBranch`** — trois ajouts après succès :
- `planModeTask.set(null)` → vide l'onglet plan du panel central
- `issueListRefreshTick.update(n => n + 1)` → déclenche un rechargement des issues dans `ProjetPanel` (l'issue est désormais fermée sur GitHub via `Closes #N`, donc elle disparaît de `displayedIssues` qui filtre sur `state === "open"`)
- L'`issueListRefreshTick` était déjà importé dans `agent.ts`, il est maintenant aussi importé dans `TaskList`