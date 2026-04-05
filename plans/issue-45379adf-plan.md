Je commence par lire `PlanPanel.svelte` pour comprendre sa structure avant de créer le worktree.
J'ai maintenant une vue complète du fichier (1785 lignes). Avant de créer le worktree, je vérifie les outils de test disponibles.
J'ai une compréhension complète du fichier. Voici le plan de découpage :

**Helpers extraits** : `PlanPanel.helpers.ts` avec les fonctions pures testables
**5 sous-composants** : un par onglet (clusters, étape, étapes, history, skills)

Je crée le worktree et commence.
### Phase RED — Tests qui échouent d'abord
Le worktree n'a pas de `node_modules`. Je lie symboliquement depuis le projet principal.
`node_modules` existe déjà. Je lie `.svelte-kit` manquant.
Le `node_modules` du worktree est incomplet. Je travaille directement dans `C:/claudicator` — le worktree servira uniquement pour la génération du patch final.
Je travaille directement dans `C:/claudicator` — chemin plus fiable sur Windows.
**RED confirmé** — le fichier de helpers n'existe pas, les tests échouent. Phase GREEN.
**GREEN — 17 tests passent.** Je crée maintenant les 5 sous-composants.
Maintenant je réécris `PlanPanel.svelte` en important les sous-composants. Je dois d'abord vérifier les types exportés depuis `$lib/stores/agent`.
419 lignes — légèrement au-dessus. J'extrais la logique `stepSymbols` dans les helpers pour descendre sous 400.
J'extrais `computeStepSymbols` dans les helpers.
Maintenant je remplace le bloc `stepSymbols` dans PlanPanel.svelte par l'appel à la fonction helper.
**399 lignes.** Phase SAFE — tests + build.
Les 11 échecs sont tous dans `tasks.step*.test.ts` — ces tests vérifient `TaskDetail.svelte`, non PlanPanel. Vérifions s'ils existaient avant mon refactoring.
Confirmé : les 11 échecs existaient **avant** mes modifications. Je restaure mes changements.
17 tests passent. Maintenant le build TypeScript pour vérifier les types.
**Build réussi sans erreur.** Phase SAFE validée.
### Étape 5 — Commit et patch

Je copie les fichiers dans le worktree, commit et génère le patch.
Le worktree `/tmp/` sera nettoyé par Windows automatiquement. Le patch est prêt.
### Étape 7 — Mise à jour des clusters (update-skill)
Trois catégories à enregistrer pour `cluster-ui-shell`. Je vérifie aussi les clusters émergents.
Clusters émergents détectés : `TaskDetail.svelte` (12 touches) et `git.ts` (19 touches) non couverts. Je les note dans mon rapport.

Mise à jour de `cluster-ui-shell` :
Je n'ai pas les permissions pour modifier `.claude/commands/`. Je documente les mises à jour ici pour que tu puisses les appliquer si tu le souhaites.

---

**Rapport update-skill :**

**Cluster mis à jour : `cluster-ui-shell`** (modifications bloquées par permissions)

Ce qui aurait été ajouté :

**Pitfalls :**
- Worktree Windows `/tmp/` → node_modules incomplets (55 stubs). Lancer `npm test` depuis le projet principal.
- Write tool dans `/tmp/` → fichiers invisibles via `bash find` (mapping `AppData/Local/Temp`). Travailler directement dans le projet.
- Svelte 5 `$:` legacy cohabite avec runes dans les fichiers existants. Ne pas migrer sans raison — conserver le mode du fichier d'origine.

**Patterns :**
- Pattern `.helpers.ts` + `.test.ts` confirmé pour PlanPanel (identique à TaskList).
- Décomposition god object multi-onglets : sous-dossier `plan/`, un composant par onglet, état local runes, données partagées en props.

**Leçons :**
- `git stash && npm test` avant refactoring pour isoler les régressions préexistantes.
- Extraire une fonction `compute*` dans helpers peut faire passer de 419 → 399 lignes.

**Clusters émergents détectés :**
- `src/lib/components/TaskDetail.svelte` (12 touches) → non couvert, à ajouter à `cluster-task-workflow`.
- `src/lib/server/services/git.ts` (19 touches) → non couvert, à ajouter à `cluster-task-workflow`.

---

**Résultat complet :**

Le patch est généré à `patches/planpanel-refactor.patch` (3633 lignes).

**Résumé :**
- `PlanPanel.svelte` : **1785 → 399 lignes** (-78%)
- **7 nouveaux fichiers** créés :
  - `PlanPanel.helpers.ts` — 4 fonctions pures + types
  - `PlanPanel.helpers.test.ts` — 17 tests (RED → GREEN → SAFE)
  - `plan/PlanTabClusters.svelte` — onglet clusters (historique + coalescence + mixed + par dossier)
  - `plan/PlanTabStep.svelte` — onglet étape courante
  - `plan/PlanTabHistory.svelte` — onglet git history
  - `plan/PlanTabSkills.svelte` — onglet candidats skills
  - `plan/PlanTabSteps.svelte` — onglet liste des étapes
- **Zéro régression** : build ✓, 17 nouveaux tests passent, 11 échecs préexistants inchangés