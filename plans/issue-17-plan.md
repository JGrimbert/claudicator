Voici les changements à faire :
1. Fusionner TASK+DESCRIPTION en un seul textarea
2. Ajouter un toggle "Mode plan" (ON par défaut)
3. Exclure OBJECTIF/CONTRAINTES/FORMAT DU PLAN du prompt quand mode plan OFF
Maintenant le template :
Maintenant le CSS pour le toggle :
Il reste aussi à corriger le `descText` dans le cas `error` et le cas `hasPlan` dans `loadContext` :
Vérification du résultat final :
Tout est correct. Voici un résumé des changements apportés à `AgentInput.svelte` :

**Script :**
- `descText` supprimé → `taskText` contient maintenant TASK + DESCRIPTION fusionnés (séparés par `\n\n` si les deux existent)
- `planMode = $state(true)` ajouté
- `ENRICH_KEYS` → remplacé par `PLAN_KEYS` (OBJECTIF/CONTRAINTES/FORMAT DU PLAN) et `DOC_KEYS` (DOCUMENTATION/CONCEPTS)
- `buildFullPrompt()` : exclut OBJECTIF/CONTRAINTES/FORMAT DU PLAN du prompt quand `planMode = false`

**Template :**
- Row 1 : un seul `textarea` (rows=4) au lieu de deux
- Header : bouton `PLAN` / `DIRECT` (violet quand actif, neutre quand inactif)
- Row 2 : les sections de plan (`planSections`) ne s'affichent que quand `planMode = true` ; les sections doc (`docSections`) toujours visibles