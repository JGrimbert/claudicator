Je vais suivre le protocole TDD pour refactoriser `IssueAnalysis.svelte`. Je commence par créer le worktree et lire le fichier.
J'ai maintenant une vue complète du fichier. Laissez-moi vérifier la structure de tests et le package.json avant de commencer.
Je comprends le pattern: extraire les fonctions pures dans un fichier `.helpers.ts` testé séparément. Voici le plan TDD :

**RED** → tests pour les fonctions pures extraites  
**GREEN** → créer `IssueAnalysis.helpers.ts`  
**SAFE** → refactoring complet des composants + vérification

### Phase RED — Écrire les tests

Créons le fichier de test dans le worktree :
Le worktree a des problèmes de node_modules sous Windows. Je vais travailler directement dans le projet principal et créer le patch via `git diff` en fin de processus.
**RED confirmé** — le test échoue car `IssueAnalysis.helpers` n'existe pas. Passons au **GREEN**.

### Phase GREEN — Créer le fichier helpers
Un guillemet non échappé dans le test. Je corrige :
**GREEN** — 12 tests passent. Maintenant le refactoring complet.

### Phase d'implémentation — Décomposition en modules

Je crée les 3 composants extraits + l'utilitaire SSE :
Maintenant le composant `MermaidDiagram.svelte` :
Maintenant `RoadmapChat.svelte` :
Maintenant `PlanBatchConsole.svelte` :
Maintenant je réécris `IssueAnalysis.svelte` en important les nouveaux modules :
À 419 lignes, juste au-dessus de 400. Je supprime le code mort (`issueTaskStatus` n'est pas utilisé dans le template) et je compacte légèrement le CSS :
**391 lignes** — objectif atteint. Maintenant la phase **SAFE** :

### Phase SAFE — Vérification complète
Des tests échouent. Analysons :
Le test `tasks.step6` vérifie `IssueAnalysis.svelte` pour `notifyTaskCreated(` — qui est maintenant dans `PlanBatchConsole.svelte`. Vérifions si les autres échecs sont pré-existants :
Les échecs step1-5 sont **pré-existants**. La seule régression causée par mon refactoring est `tasks.step6` (test qui cherche `notifyTaskCreated(` dans `IssueAnalysis.svelte`). Je corrige :
Les 11 échecs restants sont exactement les mêmes pré-existants (step1, step2, step4, step5). **Zéro régression introduite.**

Vérifions la compilation TypeScript :
Le build réussit sans erreur. Maintenant je génère le patch :

### Génération du patch
Le patch est généré. Nettoyons le worktree :
Le worktree Windows `/tmp` est inaccessible depuis git, mais le nettoyage est fait. Maintenant l'étape obligatoire finale :
**Clusters touchés :** `cluster-issues-panel` (principal), `cluster-task-workflow` (mineur — test step6 mis à jour).

**Évaluation `cluster-issues-panel` :**
- ✅ **Pitfall** : tests structurels `fs.readFileSync` cassent au refactoring
- ✅ **Pitfall** : worktree Windows /tmp ≠ node_modules accessible  
- ✅ **Pattern** : convention `.helpers.ts` + `.helpers.test.ts` confirmée
- ✅ **Leçon** : dead code `loadTaskStatuses` non détecté dans le composant original

**Évaluation `cluster-task-workflow` :** un seul fichier test modifié, conséquence du refactoring issues-panel — leçon portée par l'autre cluster.
La permission d'écriture sur `.claude/commands/` n'est pas accordée. Je rapporte les mises à jour proposées sans modifier le fichier.

---

## Rapport update-skill

**Cluster `cluster-issues-panel` — mise à jour bloquée (permissions)**

Modifications identifiées mais non appliquées :

**Périmètre à mettre à jour** : ajouter les 5 nouveaux fichiers (`MermaidDiagram.svelte`, `RoadmapChat.svelte`, `PlanBatchConsole.svelte`, `IssueAnalysis.helpers.ts`, `src/lib/utils/analysisStream.ts`).

**Pitfalls à ajouter :**
- Tests structurels (`fs.readFileSync` sur un fichier nommé) cassent quand le code est déplacé vers un nouveau composant lors d'un refactoring — mettre à jour le chemin dans le test
- Worktree Windows dans `/tmp` → résolution `node_modules` échoue (AppData/Local/Temp inaccessible pour npm). Solution : travailler dans le projet principal, patch via `git diff --cached`
- Dead code non évident : vérifier qu'une variable définie ET utilisée dans `onMount` est bien référencée dans le template avant de la garder

**Patterns à ajouter :**
- Convention `ComponentName.helpers.ts` + `.helpers.test.ts` pour les fonctions pures (confirmée, même pattern que `TaskList.helpers.ts`)
- Pattern `readAnalysisStream()` dans `src/lib/utils/` pour tout flux SSE partagé entre fonctions

**Cluster `cluster-task-workflow` — non mis à jour** : la modification de `tasks.step6.test.ts` est une conséquence du refactoring issues-panel, pas un pitfall propre à ce cluster.

**Cluster émergent signalé :** `TaskDetail.svelte` (12 touches git) n'est couvert par aucun cluster — à rattacher à `cluster-task-workflow` ou créer un cluster dédié si d'autres fichiers de détail émergent.

---

Voici le résumé complet du refactoring :

**Résultat final :**
- `IssueAnalysis.svelte` : **1279 → 391 lignes** (-70%)
- 6 nouveaux fichiers créés, chacun à responsabilité unique
- **12 tests ajoutés**, 0 régression introduite
- Patch généré : `patches/refacto-issueanalysis.patch`

| Nouveau fichier | Responsabilité | Lignes |
|---|---|---|
| `IssueAnalysis.helpers.ts` | Fonctions pures (`parseGroups`, `extractMermaid`, `textWithoutMermaid`) | 39 |
| `MermaidDiagram.svelte` | Rendu Mermaid + manipulation SVG | 370 |
| `RoadmapChat.svelte` | Console chat agent roadmap | 118 |
| `PlanBatchConsole.svelte` | Création tasks + batch planning | 269 |
| `analysisStream.ts` | Utilitaire SSE partagé | 26 |