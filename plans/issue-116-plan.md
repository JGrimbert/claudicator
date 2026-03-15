Maintenant que j'ai exploré la codebase, je vais créer le plan détaillé.
Plan créé : `plans/git-history-parser.md`

---

## Résumé du plan

### Problème central
L'onglet Clusters ne connaît que l'état courant de la cartographie. Il ne sait pas quelles méthodes ont été co-modifiées dans le passé.

### Architecture proposée

**Nouveaux fichiers :**
- `src/lib/server/services/git-history.ts` — types, storage `.agent/git-history/`, parsing diff → symboles, détection stale
- `src/routes/api/git-history/+server.ts` — GET état + commits récents
- `src/routes/api/git-history/run/+server.ts` — POST SSE pour la boucle de collecte progressive

**Fichiers modifiés :**
- `git.ts` — ajouter `getCommitLog`, `getCommitDiff`, `getHeadCommit`
- `clusters/+server.ts` — enrichir la réponse avec `historical.coal` + `isUpToDate`
- `PlanPanel.svelte` + `ArtifactViewer.svelte` — badge "à jour" + bouton d'analyse

### Points clés du design

1. **Stale detection** : un symbole est stale si `searchMethods()` ne le retrouve plus dans la cartographie actuelle. Les symboles stale sont stockés mais exclus des clusters historiques.

2. **Idempotence** : chaque commit est analysé une seule fois (`commits/<sha>.json`). Une relance reprend où elle s'est arrêtée.

3. **Additivité** : les données historiques s'ajoutent à la réponse clusters sans casser l'existant (`historical` est une propriété nouvelle).

4. **Coalescence historique** : réutilise l'algorithme de coalescence existant, mais alimenté par les co-modifications git plutôt que par la recherche sémantique actuelle.