Je comprends le problème. Le bouton "Implémenter" est bloqué car `currentStep = 0` tant qu'il n'y a pas de `planContent`. Il faut ajouter un bouton "Sauter" dans le panel plan.
Le plan est clair. Il faut :
1. Ajouter un `POST` à `/api/tasks/[id]/plan` pour sauvegarder un plan placeholder
2. Ajouter un bouton "Sauter →" dans le panel "plan" de TaskList.svelte
Maintenant le bouton dans TaskList.svelte. D'abord la fonction, puis le bouton dans le panel "plan" :
Maintenant le bouton dans le panel "plan" :
C'est en place. Voici ce qui a été modifié :

**`src/routes/api/tasks/[id]/plan/+server.ts`** — ajout d'un `POST` qui :
- Écrit le fichier `.plan.md` avec le contenu fourni (ou un placeholder)
- Met `task.status = "implementation"` et `hasPlan = true`

**`src/lib/components/TaskList.svelte`** — ajout de :
- Fonction `skipPlan()` qui appelle le POST, recharge les tasks et le plan, puis bascule sur "implement"
- Bouton "→ Sauter la planification" visible dans le panel "plan" quand il n'y a pas encore de plan

Le bouton n'apparaît que si `!planContent`, donc il disparaît automatiquement une fois le plan généré ou sauté.