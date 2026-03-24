Maintenant je lis `TaskList.svelte` pour comprendre sa structure, puis j'écris le plan.
Je crée le plan puis j'implémente.
Maintenant l'implémentation dans `atlas.ts` :
Maintenant j'intègre `findRelevantComponents` dans `writeAtlasMd` :
Vérifions le fichier final :
Il y a une complexité inutile dans le mapping `matchedFunctions`. Je simplifie :
Implémentation terminée. Voici ce qui a été fait :

**`plans/issue-261-global.md`** — plan créé.

**`src/lib/server/agent/atlas.ts`** — 3 changements :

1. **Type `ComponentHit`** (l.15) — structure de retour pour les composants.

2. **`findRelevantComponents()`** (l.80-143) — scanne `src/lib/components/**/*.svelte`, score par 4 axes :
   - nom de fichier → `TaskList` matche `task`
   - noms de fonctions (`function mergeBranch`) → poids 2
   - URL dans `fetch()` → `/api/tasks/.../merge`
   - variables `let`/`const` → `merging`, `commitMsg`

3. **Intégration dans `writeAtlasMd()`** — appel de `findRelevantComponents`, déduplication, ligne supplémentaire dans la table avec `composant UI`.

Pour l'issue #257, l'Atlas aurait maintenant remonté `TaskList` avec `mergeBranch, merging` grâce aux axes 2+3 (score ≥ 4).