# Plan global — Issue #261 : Atlas — composants UI manquants

## Problème

L'Atlas ne remonte que les implémentations serveur (`mergeBranch` dans git.ts, routes API) mais pas les
**callers UI** (`TaskList.svelte`, `mergeBranch` côté composant). Pour l'issue #257 "merge task", le fichier
central à modifier était `TaskList.svelte` — absent de l'Atlas généré.

**Cause racine** : `findRelevantRoutes()` ne scanne que `src/routes/api/`. Les composants Svelte dans
`src/lib/components/` ne sont jamais indexés, même s'ils contiennent des fonctions qui matchent la query.

---

## Solution

Ajouter `findRelevantComponents()` dans `atlas.ts`, analogue à `findRelevantRoutes()` mais pour
`src/lib/components/**/*.svelte`.

### Scoring par composant (4 axes)

| Axe | Source | Points |
|---|---|---|
| 1 | Tokens de la query dans le nom de fichier | 1 par token |
| 2 | Tokens de la query dans les noms de fonctions `<script>` | 2 par token (signal fort) |
| 3 | Tokens de la query dans les URL de `fetch()` | 1 par token |
| 4 | Tokens de la query dans les variables réactives (`let`, `const`) | 1 par token |

### Intégration dans `writeAtlasMd()`

- Les composants retenus (score > 0, top 2) sont ajoutés à la table après les routes
- Déduplication via `hitFiles` (même mécanisme que pour les routes)
- Pas de snippet Svelte par défaut (longueur imprévisible)

### Fichier modifié

`src/lib/server/agent/atlas.ts`

---

## Étapes

1. Ajouter le type `ComponentHit`
2. Implémenter `findRelevantComponents(projectRoot, query)`
3. L'appeler dans `writeAtlasMd()` après `findRelevantRoutes()`
4. Intégrer les résultats dans la table Points d'entrée

---

## Vérification

Régénérer l'Atlas pour l'issue #257 → `TaskList.svelte` doit apparaître avec `mergeBranch`.
Sur une issue serveur pure → `TaskList.svelte` ne doit pas apparaître (score = 0).
