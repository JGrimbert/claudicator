Étape 1 — vérification de l'environnement, puis installation de minisearch@6.
Installé. Maintenant, réécriture de `method-search.cjs`.
Vérifications rapides :
Tous les tests passent :

| Test | Résultat |
|---|---|
| `"liste utilisateurs"` | `getUserList` en tête (11.29) — camelCase décomposé |
| `"appeler Biblio.init"` | `Biblio.init` en tête (73.84) — bonus +50 explicite |
| `"méthode interne"` (excludeRoles) | 0 → retry extended scope → `Internal._helper` trouvé |
| Index lazy | `_indexedCount` identique → pas de rebuild |

L'implémentation est complète. Résumé des changements :

- `require('minisearch')` + `STOPWORDS` et `tokenizeCamel()` au niveau module
- `this._miniSearch = null` / `this._indexedCount = 0` dans le constructeur
- `_buildIndex()` : index lazy avec invalidation par comptage des méthodes, boost `name×3 className×2 consumers×2`
- `_doSearch()` : remplace la boucle O(n) par `ms.search()` + filtres post-MiniSearch + bonus explicite inchangé
- `minScore` par défaut changé de `3` → `0` (MiniSearch filtre déjà les non-matchs)