Je lis les deux fichiers concernés avant de modifier.
Maintenant j'implémente les 5 étapes du plan.
Maintenant le CSS — remplacement du bloc subdivisions par les nouvelles classes :
Vérifions le résultat final des zones modifiées :
Tout est en place. Résumé des modifications :

**`issue-grouping.ts`** — déduplication inter-subdivisions : les subs sont triées par taille décroissante, chaque issue n'est assignée qu'à la première branche qui la réclame, et toute sub tombant à < 2 issues est supprimée.

**`IssueGroups.svelte`** :
- `sortedGroups` : groupes avec subdivisions hissés en tête via `$derived`
- `{#each sortedGroups ...}` remplace `{#each groups ...}`
- Rendu conditionnel : si le groupe a des subdivisions → arborescence `group-tree` avec branches `├─` et résiduel `└─` ; sinon → liste plate identique à avant
- Suppression du `<details>` "Subdivisions possibles"
- CSS : remplacement des classes `.group-subdivisions`/`.sub-group` par `.group-tree`, `.tree-branch`, `.tree-branch-head`, `.branch-connector`, `.tree-leaf`, `.leaf-pipe`, `.group-residual`, `.residual-head`, `.residual-label`, `.sub-extra-kw`