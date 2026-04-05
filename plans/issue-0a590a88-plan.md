Je vais implementer le plan CSS directement. Commençons par explorer les fichiers concernés.
Pas d'`app.css` - les globaux sont dans `+layout.svelte`. Je vais lire les fichiers à modifier en parallèle.
Je vais utiliser le TodoWrite pour tracker les tâches, puis lire plus de fichiers.
Je commence par les utilitaires globaux dans `+layout.svelte` :
Maintenant ArchiView.svelte — supprimer `.atlas-header`, `.atlas-title`, `.atlas-subtitle` :
Le bloc stack/tree est entièrement mort (14 classes, aucune dans le template). Je supprime, et le `@keyframes blink` local puisqu'il est maintenant global :
Supprimer le `@keyframes blink` local (maintenant global) :
Je confirme les classes mortes dans AgentConsole (stats-bar, recherche, blink local, result-raw) :
Je vais centraliser `.wf-btn` dans `+layout.svelte` comme classe globale, puis nettoyer les 4 fichiers.
Maintenant supprimer les duplicatas de chaque composant. WorkflowBar.svelte en premier :
PushMergePanel.svelte :
PatchViewer.svelte :
FullPlanIssueTree.svelte — garder seulement les variantes spécifiques `.wf-stale` et `.wf-commit-all` :
Maintenant `.monospace` dans `+layout.svelte`. Puisque c'est un `:global()`, il fonctionne bien comme utilitaire. La question est : quelque chose l'utilise-t-il ?
Aucune utilisation — je retire juste `:global(.monospace)` de la règle :
Vérifions que le build compile sans erreur :
`@keyframes` n'accepte pas `:global()` en Svelte — ils sont automatiquement globaux. Fix :
Build réussi. Maintenant l'étape `update-skill` obligatoire du protocole :
**Clusters touchés :** `cluster-ui-shell` (+layout.svelte) et `cluster-agent-loop` (AgentConsole.svelte).

**Évaluation :**
- `cluster-ui-shell` : pitfall réel → `@keyframes` interdit dans `:global()` en Svelte. Pattern → utilitaires globaux via `:global()` dans `+layout.svelte`.
- `cluster-agent-loop` : nettoyage CSS pur, aucun pitfall/pattern/leçon lié à l'architecture SSE.
La mise à jour du skill n'a pas été autorisée. Voici le rapport final de la session :

---

## Résultat : Audit CSS — nettoyage et abstraction

**Build :** ✓ (`vite build` — 0 erreur)

### Modifications effectuées

| Fichier | Action |
|---|---|
| `src/routes/+layout.svelte` | Ajout utilitaires globaux : `.scroll-thin`, `.label-xs`, `.fill-col`, `@keyframes blink`, `.wf-btn` + variantes |
| `src/lib/components/ArchiView.svelte` | Suppression `.atlas-header`, `.atlas-title`, `.atlas-subtitle` (3 classes mortes certifiées) |
| `src/lib/components/IssueGroupCard.svelte` | Suppression bloc stack/tree (14 classes mortes) + `@keyframes blink` local dupliqué |
| `src/lib/components/AgentConsole.svelte` | Suppression stats-bar (10 classes), agent-search (3 classes), `.result-raw`, `.search-input`, `.search-submit`, `.blink` + `@keyframes blink` local |
| `src/lib/components/WorkflowBar.svelte` | `.wf-btn` supprimé (centralisé) |
| `src/lib/components/PushMergePanel.svelte` | `.wf-btn` + 6 variantes supprimées (centralisées) |
| `src/lib/components/PatchViewer.svelte` | `.wf-btn` supprimé (centralisé) |
| `src/lib/components/FullPlanIssueTree.svelte` | Base `.wf-btn` supprimée (centralisée) |

### Points importants découverts

- **`@keyframes` ne s'enveloppe PAS dans `:global()`** en Svelte — build error. Ils sont natifs globaux dans `<style>`.
- **CssAnalysis rate les bindings dynamiques** (`is-{state}`, `badge--{source}`) — vérification manuelle requise avant suppression.
- Les classes `skill-badge--coal/historical/commit` (PlanTabSkills) et `is-patch-*` (FullPlanIssueTree) sont dynamiquement assignées — **non supprimées** contrairement au plan.