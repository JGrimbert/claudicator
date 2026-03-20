Laisse-moi examiner les fichiers modifiés pour comprendre l'état actuel.
Laisse-moi vérifier les fichiers déjà modifiés et le plan existant.
Le plan précédent est entièrement implémenté. Le travail actuel (#235) est d'améliorer l'algorithme de groupement pour fusionner : "multirepo"/"multi repo", "orchestration"/"orchestrateur", "skillGraph"/"graph".

Je vais ajouter une étape `mergeEquivalentStems` dans `issue-grouping.ts` :
Maintenant, j'intègre cette fonction dans `detectIssueGroups`. Après l'étape 2 (calcul de `wordFreq`), j'ajoute l'étape 2b :
Maintenant, mettre à jour l'étape 7 pour utiliser `canonicalFreq` et `issueCanonicals` :
Vérifions le résultat final du fichier :
Le fichier est correct. Voici ce qui a été implémenté :

**Fonction `mergeEquivalentStems`** (Union-Find) avec deux règles de fusion :

1. **Préfixe commun ≥ 6 chars** — fusionne les variantes morphologiques :
   - `"orchestration"` + `"orchestrateur"` → préfixe `"orchestrat"` (10 chars) → même groupe

2. **Début/fin de mot composé, min 4 chars** — fusionne les composés :
   - `"repo"` + `"multirepo"` → `"multirepo".endsWith("repo")` → même groupe
   - `"graph"` + `"skillgraph"` → `"skillgraph".endsWith("graph")` → même groupe

Le stem canonique choisi est le **plus fréquent** (à égalité, le plus court = le plus général).

Les étapes 3, 4 et 7 de `detectIssueGroups` utilisent désormais `canonicalFreq` et `issueCanonicals` au lieu de `wordFreq` et `issueTokens`. Le calcul des jumeaux et subdivisions reste inchangé (il opère sur les titres bruts, ce qui est correct).