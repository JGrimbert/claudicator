Le `dist/index.js` n'a pas été recompilé — les modifications de `JgrRoadmap.svelte` ne sont pas dans le bundle. Il faut rebuilder jgr-ui.
Build réussi. Mais laissons-moi vérifier si les problèmes de doublon sont vraiment réglés dans le rendu, en regardant `JgrItem`.
Le build est fait. Vérifions que le dist a les 3 corrections :
Tout est en ordre. Le problème était que `npm run package` n'avait pas été exécuté après les modifications de `JgrRoadmap.svelte`. Le `dist/index.js` ré-exportait des fichiers `.svelte` obsolètes.

**Ce qui était fait (src) mais pas compilé (dist) :**

1. **Doublon Steps** — les numéros d'issues `#n` n'étaient plus dans `labels` (couleur `#446688`), mais le dist gardait l'ancien code → doublon visible
2. **Clusters enrichis** — `memberSteps`, `topSkills`, `homoScore` présents dans src mais absents du dist compilé
3. **Score `∼XX%`** — idem

**Correction appliquée :** `npm run package` dans `C:/jgr-ui` — le dist est maintenant synchronisé.

Rechargez l'app dans le navigateur pour voir les changements.