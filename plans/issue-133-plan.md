Je vais d'abord explorer le code pour comprendre la structure actuelle des skills avant de produire le plan.
J'ai maintenant une vision complète du pipeline. Je vais produire le plan.
Plan créé dans `plans/calibrage-skills-global.md`.

---

**Résumé du plan**

### Problème identifié

L'algorithme de coalescence dans `/api/clusters` génère un nœud par ensemble d'issues distinct — résultat : plusieurs nœuds avec des symboles redondants (ex. `{buildQuery, getVueScriptOffset}` ET `{buildQuery, getVueScriptOffset, saveSnapshot}` avec les mêmes 7 issues), chacun devenant un skill séparé.

De plus, le seuil `score >= 6` autorise des clusters à seulement 2 issues.

---

### Les deux filtres (ordre d'application)

**Filtre 2 en premier — seuil d'usage :**
```ts
coal.filter(n => n.score >= 6 && n.count >= 3)
```
Élimine les usages marginaux (2 issues seulement). Cohérent avec le filtre historique qui exige déjà `count >= 3`.

**Filtre 1 ensuite — déduplication sous-ensemble :**
Nouveau helper `deduplicateSubsets()` dans `skill-proposals.ts`. Pour chaque nœud trié par score décroissant : si ses symboles ET ses issues sont tous contenus dans un nœud déjà retenu → on le supprime.

---

### Fichiers à modifier

| Fichier | Modification |
|---|---|
| `src/lib/server/services/skill-proposals.ts` | Ajouter `deduplicateSubsets()` |
| `src/routes/api/skills/generate/+server.ts` | Appliquer les deux filtres |