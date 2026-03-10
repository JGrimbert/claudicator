Je vais lire les fichiers pertinents pour comprendre la structure existante avant d'implémenter.
**Étape 1 — `buildUpdatePrompt` dans `issue-analysis.ts`**
**Étape 2 — Nouvel endpoint `/api/issues/analyze/update/+server.ts`**
**Étape 3 — Ajouter `updating` dans le store `issueAnalysis`**
**Étape 4 — Bouton "Intégrer" dans `IssueList.svelte`**

Ajouter la fonction `startUpdate` et modifier la zone du badge diff :
Maintenant modifier le badge diff pour ajouter le bouton "Intégrer" :
Ajouter le style CSS pour les nouveaux éléments :
**Étape 5 — Libellé "Intégration en cours…" dans `IssueAnalysis.svelte`**
Mettre aussi à jour le point indicateur dans le header pour qu'il pulse pendant `updating` :
Toutes les étapes sont implémentées. Voici le résumé des modifications :

---

**Fichiers créés/modifiés :**

| Fichier | Modification |
|---|---|
| `src/lib/server/agent/issue-analysis.ts` | Ajout du type `PreparedIssue` et de `buildUpdatePrompt()` |
| `src/routes/api/issues/analyze/update/+server.ts` | **Nouveau** — endpoint SSE POST, charge l'analyse existante, prépare les nouvelles issues, spawn Claude, fusionne le snapshot par upsert |
| `src/lib/stores/agent.ts` | Champ `updating: boolean` ajouté dans `issueAnalysis` |
| `src/lib/components/IssueList.svelte` | Fonction `startUpdate()` + bouton "⊕ Intégrer" dans le badge diff (visible si `hasResult && !running && !updating && issues added/modified`) |
| `src/lib/components/IssueAnalysis.svelte` | Console et header réagissent à `updating` — libellé "Intégration des issues" + message "Intégration des nouvelles issues…" |

**Comportement :**
- Le bouton "⊕ Intégrer" n'apparaît que si une analyse existe et qu'il y a des issues ajoutées ou modifiées
- Si Claude réussit → `analysis.md` est mis à jour, snapshot fusionné par upsert (pas de doublons), badge diff disparaît
- En cas d'erreur → `analysis.md` reste intact
- `updating` est remis à `false` dans le bloc `finally` (même en cas d'erreur)