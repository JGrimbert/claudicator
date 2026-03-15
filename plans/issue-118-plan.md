Je vais lire les sections pertinentes de PlanPanel.svelte pour affiner le plan.
J'ai toutes les informations nécessaires. Je vais écrire le plan.
Plan créé dans `plans/coalesce-histo-coal.md`. Voici le résumé :

---

## Plan — Coalesce Histo et Coalescence

### 1. Analyse

Les deux sections (HISTORIQUE + COALESCENCE) peuvent partager les mêmes symboles. L'objectif est d'afficher les données historiques **inline dans chaque nœud de coalescence** : symboles en lavande, badge commits, issues barrées si déjà dans coal.

### 2. Fichiers touchés

| Fichier | Rôle |
|---|---|
| `git-history.ts` | Ajouter `issues: number[]` à `HistoricalCoalNode` (collecter depuis `issueRefs` des commits communs) |
| `clusters/+server.ts` | Ajouter `histMatch?` à `CoalNode` ; calcul du matching par intersection ≥ 2 symboles et ≥ 50 % |
| `IssueChip.svelte` | Nouvelle prop `strikethrough?: boolean` → `<s>#id</s>` en style grisé |
| `PlanPanel.svelte` | Afficher badge commits + symboles lavande + issues hist dans COALESCENCE ; filtrer HISTORIQUE sur non-matchés |

### 3. Logique clé du matching (serveur)
Pour chaque `CoalNode` → chercher dans `historical.coal` le meilleur `HistoricalCoalNode` par ratio d'intersection. Si ratio ≥ 50 % et ≥ 2 symboles communs → `histMatch = { symbols, count, issues }`.

### 4. Point de décision à confirmer

Les issues historiques déjà dans `coal.issues` seront-elles affichées en **double** (normal + barré) ou seulement comme badge sur le chip existant ? Le plan propose la version simple (deux chips séparés), mais une version dédoublonnée est possible.