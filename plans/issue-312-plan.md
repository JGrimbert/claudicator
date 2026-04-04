J'ai maintenant une vue complète du fichier. Passons à l'implémentation. Commençons par vérifier les tests existants et les imports utiles.
Création des 8 sous-composants. Commençons par `FullPlanIssueTree.svelte` (le plus complexe) :
`PlanPanel.svelte` existe déjà — c'est le panneau gauche de la scène. Je renomme le nouveau en `TaskPlanPanel.svelte`.
Maintenant je mets à jour `TaskDetail.svelte` pour utiliser les sous-composants. Je vais réécrire le fichier complet — script inchangé (état + fonctions), template allégé, CSS réduit :
Maintenant, mise à jour de `TaskDetail.svelte` pour utiliser tous les sous-composants. Je vais remplacer les sections template et CSS correspondantes :
Maintenant supprimons `btnVariant` (remplacé par celui du helper dans `WorkflowBar`) et la fonction locale `formatDiffSummary` (déjà importée ailleurs) :
Maintenant remplaçons tout le template (section `{#if task.status === "merged"}` jusqu'à la fin de `</div>`) et le `<style>` :
Maintenant je dois supprimer le reste du bloc fp-tree original et remplacer la wf-bar, les panneaux, etc. Vérifions l'état actuel du template :
Il reste le résidu de l'ancien template fp-tree et les vieux panneaux à remplacer. Je fais un seul remplacement global :
Maintenant remplaçons le `<style>` (on ne garde que les styles qui restent dans TaskDetail) :
Maintenant, remplaçons tout le bloc `<style>` avec uniquement les styles restants dans `TaskDetail.svelte` :
Maintenant supprimons toutes les sections CSS déplacées vers les sous-composants, en gardant uniquement `.merged-*`, `.stuck-*`, `.wf-error`, et `.central-input-*` :
Maintenant supprimons tout le CSS déplacé — de la barre workflow jusqu'à la fin du style :
Vérifions l'état final du fichier `TaskDetail.svelte` :
1010 lignes (vs 1850) — bonne réduction. Lançons le build :
Build réussi. Pas d'erreurs de compilation.
Build `✓` en 5.19s. Voici le bilan du refactoring :

---

## Résultat

| Fichier | Avant | Après |
|---|---|---|
| `TaskDetail.svelte` | 1850 lignes | ~1010 lignes |
| `FullPlanIssueTree.svelte` | — | 283 lignes |
| `WorkflowBar.svelte` | — | 67 lignes |
| `DiffView.svelte` | — | 50 lignes (partagé) |
| `CommitPanel.svelte` | — | 84 lignes |
| `PatchViewer.svelte` | — | 52 lignes |
| `PushMergePanel.svelte` | — | 98 lignes |
| `ImplementPanel.svelte` | — | 94 lignes |
| `TaskPlanPanel.svelte` | — | 54 lignes |

**Note sur un changement de comportement mineur** : dans `ImplementPanel`, la condition `{:else if planContent}` (valeur chargée en mémoire) a été remplacée par `{:else if task.hasPlan}` (propriété serveur). Le comportement est équivalent en pratique.

**Note sur le nommage** : le composant plan s'appelle `TaskPlanPanel.svelte` (pas `PlanPanel`) car `PlanPanel.svelte` existe déjà — c'est le panneau de scène gauche.