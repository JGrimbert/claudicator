Voici le plan détaillé.

---

# Plan — Migration des statuts de tâches

## 1. Analyse du problème

Le système actuel encode 4 états (`pending | running | done | failed`) et s'appuie sur des champs additionnels (`branch`, `pushed`, `hasPlan`) pour déduire l'étape réelle dans le pipeline. Cela crée une logique implicite éparpillée dans plusieurs fichiers.

**Objectif :** Remplacer ce système par 6 statuts explicites correspondant aux étapes du workflow, plus `failed` conservé comme état d'erreur transversal. L'étape `merged` déclenche un affichage réduit (résumé seul, sans actions).

---

## 2. Localisation des usages

### Type et persistance
| Fichier | Usage |
|---|---|
| `src/lib/server/services/tasks.ts` | Définition de `TaskStatus`, `createTask`, `updateTask`, lecture JSON |
| `src/hooks.server.ts` | Reset des tasks `running` → `failed` au démarrage |

### Routes API qui écrivent le statut
| Fichier | Transition actuelle |
|---|---|
| `src/routes/api/agent/run/+server.ts` | `pending → running → done/failed` |
| `src/routes/api/agent/kill/+server.ts` | `running → failed` |
| `src/routes/api/tasks/[id]/+server.ts` | PATCH libre |
| `src/routes/api/tasks/[id]/initial-commit/+server.ts` | conserve `done`, ajoute `branch` |
| `src/routes/api/tasks/[id]/commit/+server.ts` | conserve `done` |
| `src/routes/api/tasks/[id]/push/+server.ts` | conserve `done`, ajoute `pushed: true` |
| `src/routes/api/tasks/[id]/merge/+server.ts` | conserve `done` |
| `src/routes/api/tasks/[id]/sync/+server.ts` | détecte merge → `done` |

### Composants UI qui lisent le statut
| Fichier | Usage |
|---|---|
| `src/lib/components/TaskList.svelte` | libellés, couleurs, filtre, `taskPipelineStep()`, boutons d'action |
| `src/lib/components/ItemRow.svelte` | affichage via props |
| `src/lib/components/RunConsole.svelte` | lecture indirecte via store agent |

---

## 3. Nouveau modèle de statuts

```typescript
export type TaskStatus =
  | "specification"    // tâche créée, plan non encore généré
  | "planification"    // Claude génère le plan (processus actif)
  | "implementation"   // plan prêt, implémentation à lancer ou en cours
  | "documentation"    // implémentation terminée, à commiter
  | "validation"       // commitée sur la branche, à pusher
  | "merged"           // mergée, état final (affichage réduit)
  | "failed";          // erreur à n'importe quelle étape
```

### Correspondance avec le workflow réel

| Étape | Déclencheur | Statut résultant |
|---|---|---|
| Création de tâche | `createTask()` | `specification` |
| Début génération plan | bouton "Générer le plan" | `planification` |
| Plan généré avec succès | fin du process Claude (run) | `implementation` |
| Échec plan / kill | process killed ou exit ≠ 0 | `failed` |
| Initial Commit effectué | `/initial-commit` | `implementation` (conservé, `branch` ajouté) |
| Début implémentation | bouton "Lancer l'impl." | `planification` → reste `implementation` pendant l'exec, mais on distingue via le process actif |
| Implémentation terminée | fin process Claude (run) | `documentation` |
| Échec impl / kill | process killed ou exit ≠ 0 | `failed` |
| Commit effectué | `/commit` | `validation` |
| Push effectué | `/push` | `validation` (conservé, `pushed: true`) |
| Merge détecté/effectué | `/merge` ou `/sync` | `merged` |

> **Note sur `planification` vs run implémentation :** Le status `planification` est réservé à la phase plan. Pendant l'implémentation, le task reste `implementation` mais le process est tracké via `processes.ts`. L'UI peut détecter "en cours" via le store `agent` existant plutôt que via le status.

---

## 4. Stratégie de migration

### Migration des fichiers JSON existants

Dans `listTasks()` ou au moment de la lecture de chaque fichier, appliquer une migration à la volée **sans modifier les fichiers** (ou avec migration en écriture silencieuse au premier accès) :

```
"pending"  → "specification"
"running"  → "failed"           (était stale, reset cohérent)
"done" (no branch)  → "implementation"
"done" (branch, !pushed)  → "documentation"
"done" (branch, pushed)  → "validation"
"failed"   → "failed"           (inchangé)
```

Ajouter une fonction `migrateTaskStatus(raw: any): Task` appelée dans `listTasks()` et `getTask()`.

---

## 5. Étapes de modification du code

### Étape 1 — `src/lib/server/services/tasks.ts`

1. Remplacer la définition de `TaskStatus`
2. Mettre à jour `createTask()` : statut initial = `"specification"`
3. Ajouter `migrateTaskStatus()` pour la migration à la volée
4. Appeler `migrateTaskStatus()` dans les deux endroits où un fichier JSON est parsé (`listTasks` et `getTask`)

### Étape 2 — `src/hooks.server.ts`

- Remplacer `status === "running"` par `status === "planification"`
- (Les tasks `implementation` ne sont pas stales : Claude ne tourne plus, la tâche est juste en attente d'action utilisateur)

### Étape 3 — `src/routes/api/agent/run/+server.ts`

Deux appels `run` distincts : génération plan et implémentation.

- **Début de génération plan :** `"specification"` → `"planification"`
- **Plan généré (succès) :** `"planification"` → `"implementation"`
- **Début implémentation :** pas de changement de statut (reste `"implementation"`)
- **Implémentation terminée (succès) :** `"implementation"` → `"documentation"`
- **Échec (exit ≠ 0) :** → `"failed"` dans les deux cas

> Distinguer les deux phases : ajouter un paramètre `phase: "plan" | "implementation"` dans le body de la requête, ou déduire via le statut courant de la task au moment de l'appel.

### Étape 4 — `src/routes/api/agent/kill/+server.ts`

- Conserver `→ "failed"` (pas de changement fonctionnel)

### Étape 5 — Routes de workflow

| Fichier | Changement |
|---|---|
| `/initial-commit/+server.ts` | pas de changement de statut, `branch` déjà ajouté |
| `/commit/+server.ts` | `"documentation"` → `"validation"` |
| `/push/+server.ts` | conserver `"validation"`, ajouter `pushed: true` |
| `/merge/+server.ts` | `"validation"` → `"merged"` |
| `/sync/+server.ts` | si branche mergée détectée → `"merged"` |

### Étape 6 — `src/routes/api/tasks/[id]/+server.ts`

- Mettre à jour le PATCH endpoint pour accepter les nouveaux statuts (si une validation est présente)
- Ajouter `"specification"` comme cible valide pour le reset depuis `"failed"`

### Étape 7 — `src/lib/components/TaskList.svelte`

**Libellés :**
```
specification  → "Spécification"
planification  → "Planification"
implementation → "Implémentation"
documentation  → "Documentation"
validation     → "Validation"
merged         → "Mergée"
failed         → "Échouée"
```

**Couleurs :**
```
specification  → #555555 (gris neutre)
planification  → #f7c948 (jaune - actif)
implementation → #2196f3 (bleu - prêt)
documentation  → #ff9800 (orange - action requise)
validation     → #9c27b0 (violet - action requise)
merged         → #4caf50 (vert - terminé)
failed         → #f44336 (rouge)
```

**Filtres :** remplacer les valeurs actuelles par les 6 nouveaux + `"all"` + `"failed"`

**Suppression de `taskPipelineStep()` :** le statut encode désormais l'étape directement. La logique de `pipelineLabel()` est remplacée par une lookup table simple `status → label`.

**Affichage conditionnel pour `merged` :**
- Si `task.status === "merged"` : afficher uniquement le résumé (issue #, lien, date, usage tokens)
- Sinon : affichage normal avec boutons d'action

**Reset depuis `failed` :** le bouton "Réinitialiser" remet à `"specification"` (au lieu de `"pending"`)

### Étape 8 — `src/lib/components/ItemRow.svelte`

- Vérifier et adapter si le composant lit directement `task.status`
- Appliquer le même masquage pour `merged`

---

## 6. Vérifications et nettoyage final

### Vérifications fonctionnelles
- [ ] Créer une tâche → statut `specification`
- [ ] Lancer la génération du plan → passe à `planification` puis `implementation`
- [ ] Kill pendant plan → passe à `failed`
- [ ] Reset depuis `failed` → revient à `specification`
- [ ] Initial commit → `branch` ajouté, statut reste `implementation`
- [ ] Lancer l'implémentation → reste `implementation` pendant l'exec
- [ ] Implémentation terminée → passe à `documentation`
- [ ] Commit → passe à `validation`
- [ ] Push → reste `validation`, `pushed: true`
- [ ] Merge → passe à `merged`
- [ ] Restart serveur avec task `planification` en cours → reset à `failed`
- [ ] Affichage tâche `merged` → résumé seul sans boutons d'action

### Vérifications de migration
- [ ] Charger des fichiers JSON anciens (avec `pending`, `running`, `done`, `failed`) → migration correcte à la volée
- [ ] Pas de crash si le champ `status` est manquant ou inconnu

### Nettoyage
- Supprimer `taskPipelineStep()` de TaskList.svelte après remplacement
- Supprimer la map `pipelineLabel()` si remplacée
- Vérifier qu'aucune référence à `"pending"`, `"running"`, `"done"` ne subsiste dans le code (hors migration)