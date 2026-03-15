J'ai maintenant une vision complète. Voici le plan :
Plan sauvegardé dans `plans/issue-invalidation-closed-global.md`.

---

## Résumé du plan

### 1. Analyse du problème
Le snapshot `.agent/analysis-snapshot.json` ne stocke pas le champ `state` des issues. Sans cela, impossible de détecter côté client qu'une issue référencée dans un groupe de roadmap est fermée.

### 2. Localisation des usages
5 points d'impact principaux :
- `snapshot/+server.ts` — type `IssueSnapshot` à enrichir
- `analyze/+server.ts` + `update/+server.ts` — construction du snapshot (ajouter `state`)
- `stores/agent.ts` — nouveau store dérivé `planGroupsWithInvalidations`
- `PlanPanel.svelte` — affichage strikethrough + badge + bouton "Reprocesser"
- `IssueAnalysis.svelte` — bannière + bouton "Régénérer"

### 3. Stratégie de remplacement
Aucune migration destructive. Le champ `state` est **optionnel** dans le type — les anciens snapshots tombent en fallback `"open"` (aucune régression).

### 4. Étapes de modification (6 étapes)
| # | Fichier(s) | Action |
|---|---|---|
| 1 | `snapshot`, `analyze`, `update` | Ajouter `state` dans `IssueSnapshot` et `snapshotData` |
| 2 | `stores/agent.ts` | `issueStates` + `planGroupsWithInvalidations` + `hasInvalidatedSlots` |
| 3 | `PlanPanel.svelte` | `IssueChip` en strikethrough + badge ⚠ + bouton Reprocesser |
| 4 | **Nouveau** `reprocess-group/+server.ts` | Retire les issues fermées du bloc Markdown du groupe |
| 5 | `IssueAnalysis.svelte` | Bannière d'alerte + bouton "Régénérer" |
| 6 | `PlanPanel.svelte` | Recharger `issueAnalysis.result` après reprocess |

### 5. Vérifications
- Rétro-compatibilité snapshot ancienne version
- Groupe entièrement fermé → suppression du bloc
- Issue fermée dans plusieurs groupes → chaque groupe traité indépendamment