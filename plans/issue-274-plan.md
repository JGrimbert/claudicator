**Étape 1 — `fullPlans.ts`**
**Étape 2 & 3 — Routes API (en parallèle)**
**Étape 4 — Modifier `stack-plan-full/+server.ts`**
**Étape 5 — Store `activeFullPlan` dans `agent.ts`**
**Étape 6 — Modifier `IssueGroups.svelte`**
**Étape 7 — Créer `FullPlanView.svelte`**
**Étape 8 — Modifier `+page.svelte`**
Maintenant le `onMount` et le template :
Maintenant ajouter le cas `fullplan` dans le template :
**Étape 9 — Skill `.claude/commands/plan-complet.md`**
Tout est implémenté. Voici le récapitulatif :

---

**Fichiers créés/modifiés :**

| Fichier | Action |
|---|---|
| `src/lib/server/services/fullPlans.ts` | Nouveau — service CRUD (`createFullPlan`, `updateFullPlan`, `getFullPlan`, `listFullPlans`) |
| `src/routes/api/issues/groups/full-plans/+server.ts` | Nouveau — `GET` retourne la liste |
| `src/routes/api/issues/groups/full-plans/[id]/content/+server.ts` | Nouveau — `GET` retourne le texte brut du plan |
| `src/routes/api/issues/groups/stack-plan-full/+server.ts` | Modifié — crée le JSON au départ, émet `[planId]`, met à jour `done`/`error` |
| `src/lib/stores/agent.ts` | Modifié — ajout du store `activeFullPlan` + type `ActiveFullPlan` |
| `src/lib/components/IssueGroups.svelte` | Modifié — alimente `activeFullPlan` sur `[planId]`, `[done]` et erreur |
| `src/lib/components/FullPlanView.svelte` | Nouveau — composant spinner/erreur/markdown |
| `src/routes/+page.svelte` | Modifié — tab `fullplan`, auto-basculer sur `done`, restore au `onMount` |
| `.claude/commands/plan-complet.md` | Nouveau — skill avec format de sortie obligatoire |

**Comportement :**
- Lancer "Plan complet" → onglet `plan complet` apparaît immédiatement (état `generating`)
- Génération terminée → bascule automatiquement vers l'onglet et affiche le markdown
- Refresh fenêtre → `onMount` recharge le dernier plan depuis `.agent/full-plans/`
- Si processus interrompu par refresh → statut remis à `error` côté client