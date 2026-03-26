Maintenant j'ai une vue complète. Voici ce que je dois implémenter :

1. Ajouter un champ `type` au type `Task` (`"standard" | "fullplan"`)
2. Ajouter un champ `fullPlanId` pour lier la task au FullPlan
3. Créer une task de type `fullplan` lors de la génération d'un plan complet
4. Dans `TaskList`, quand on sélectionne une task de type `fullplan`, naviguer vers le panel FullPlanView (en setant `activeFullPlan`)

Lisons les fichiers clés avant de modifier :
Lisons comment `selectTask` fonctionne dans TaskList pour comprendre ce qu'il faut modifier :
J'ai tout ce qu'il faut. Voici le plan d'implémentation :

1. Ajouter `type` et `fullPlanId` au type `Task`
2. Créer une task de type `fullplan` lors de la génération du plan complet
3. Ajouter un endpoint `GET /api/issues/groups/full-plans/[id]`
4. Dans `TaskList.selectTask`, détecter les tasks `fullplan` → setter `activeFullPlan` plutôt que `planModeTask`
5. Dans `+page.svelte`, switcher sur `fullplan` dès que `activeFullPlan` est set (pas seulement quand `done`)
**1. `tasks.ts` — ajout `type` et `fullPlanId`**
**2. `stack-plan-full/+server.ts` — créer la task au démarrage, mettre à jour à la fin**
`allIssues` est défini après ma création de task — je dois corriger ça en calculant le count inline :
Maintenant, mettre à jour le statut de la task à la fin (done / error) :
**3. Nouveau endpoint `GET /api/issues/groups/full-plans/[id]`**
Il n'existe pas encore de `+server.ts` directement dans `[id]/`. Je le crée :
**4. `TaskList.svelte` — adapter `selectTask` et le type local**
Ajouter `type` et `fullPlanId` au type local `Task` :
Maintenant, adapter `selectTask` pour détecter les tasks `fullplan` :
**5. `+page.svelte` — switcher vers `fullplan` dès que `activeFullPlan` est set**
Tout est implémenté. Voici le résumé des changements :

---

**`tasks.ts`**
- Nouveau type `TaskType = "standard" | "fullplan"`
- Champs `type?` et `fullPlanId?` sur `Task`
- `createTask` accepte maintenant `type`, `fullPlanId`, et un `status` initial

**`stack-plan-full/+server.ts`**
- Crée une task `{ type: "fullplan", status: "planification", fullPlanId: planId }` après le `createFullPlan`
- Met à jour la task en `"implementation"` quand le plan est généré, `"failed"` en cas d'erreur

**`full-plans/[id]/+server.ts`** (nouveau)
- Endpoint `GET` pour récupérer un FullPlan par son ID

**`TaskList.svelte`**
- Import `activeFullPlan` depuis les stores
- `selectTask` : si `task.type === "fullplan"`, fetch le FullPlan et set `activeFullPlan` (au lieu de `planModeTask`) → panel FullPlanView s'ouvre
- Toggle de déselection : efface `activeFullPlan` pour les tasks fullplan

**`+page.svelte`**
- Réactif `$: if ($activeFullPlan) activeMiddleTab = "fullplan"` — switche dès qu'un fullplan est sélectionné (que ce soit depuis IssueGroups pendant la génération, ou depuis TaskList via un clic)