Maintenant je lis les fichiers clés pour comprendre l'état actuel.
Laissez-moi lire les autres fichiers nécessaires.
Je vais lire la suite du composant pour comprendre le template complet.
J'ai maintenant une vue complète. Voici le plan d'implémentation :

1. **`git-history.ts`** : Ajouter `getCommitClusters()` - groupe les symboles par ensemble exact par commit (inclut les groupes avec count=1 comme `buildContext`, `ensureDir`, etc.)
2. **`/api/git-history/+server.ts`** : Exposer `commitClusters` dans la réponse
3. **`PlanPanel.svelte`** : Ajouter l'onglet "skills" avec la liste des candidats filtrés + bouton de génération (déplacé depuis clusters)
Maintenant les modifications dans `PlanPanel.svelte`. Je vais faire les édits en séquence.
Maintenant, j'ajoute la variable `skillCandidates` juste avant `</script>` :
Maintenant j'ajoute le bouton de l'onglet "skills" dans la barre d'onglets :
Maintenant je retire le bouton "Générer les skills" du tab clusters et j'ajoute le contenu du tab skills. D'abord, je retire le bloc du tab clusters :
Maintenant j'ajoute le contenu du tab skills avant le `{:else}` des étapes :
Enfin, j'ajoute le CSS pour le badge "commit" :
Vérification rapide du résultat final :
Tout est en place. Voici un résumé des changements :

---

### Ce qui a été implémenté

**`git-history.ts`** — nouvelle fonction `getCommitClusters()`
- Groupe les symboles par ensemble exact par commit (pas besoin de 2+ co-occurrences)
- Permet d'inclure `buildContext`, `ensureDir`, `getTasksDir`, `listProjects`, `listTasks`, `migrateTaskStatus` (+2) qui étaient absents de `histCoal` (apparus ensemble dans un seul commit)

**`/api/git-history/+server.ts`** — expose `commitClusters` dans la réponse GET

**`PlanPanel.svelte`** — onglet **skills** (5ème onglet)
- **Liste CANDIDATS** : union de 3 sources triées par score décroissant
  - `coal` (sémantique) → badge `sém`
  - `histCoal` (≥2 commits communs) → badge `hist`
  - `commitClusters` (1+ commit) non couverts par histCoal → badge `commit`
- **Bouton "Générer les skills"** déplacé depuis l'onglet clusters
- **SKILLS GÉNÉRÉS** après génération
- Déduplication : les commit clusters déjà dans `histCoal` ne sont pas doublonnés