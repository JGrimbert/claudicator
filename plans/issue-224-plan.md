Je vais lire les parties pertinentes pour comprendre l'affichage actuel du plan.
Voyons comment le plan est affiché dans la scène principale et le composant RunConsole.
Je cherche où le plan est rendu dans la scène principale (RunConsole ou autre).
J'ai bien compris l'architecture. Le plan est affiché via `JgrPre` (read-only) dans `AgentInput.svelte` quand `hasPlan = true`. Je vais ajouter :

1. Un mode édition dans `AgentInput.svelte` (textarea + boutons Sauvegarder/Annuler)
2. Un `PUT` dans la route plan pour sauvegarder sans changer le statut
Maintenant j'ajoute le mode édition dans `AgentInput.svelte`. La logique : quand `hasPlan = true`, afficher un bouton "✎" à côté du `JgrPre` qui bascule en textarea éditable avec Sauvegarder/Annuler.
Maintenant j'ajoute le bouton d'édition et le mode édition dans le template HTML :
Maintenant j'ajoute les styles CSS :
Il faut aussi fermer le `{/if}` du bloc `hasPlan` correctement. Vérifions que le template est cohérent :
Le template est correct. Les `{/if}` sont bien imbriqués. Marquons la tâche comme complète.
C'est fait. Voici ce qui a été implémenté :

**`src/routes/api/tasks/[id]/plan/+server.ts`**
- Nouveau `PUT` : sauvegarde le contenu sans toucher au statut de la tâche

**`src/lib/components/AgentInput.svelte`**
- 3 nouvelles variables : `editingPlan`, `editText`, `savingPlan`
- Fonctions `startEditPlan()`, `cancelEditPlan()`, `savePlan()` (appelle `PUT`)
- Quand `hasPlan = true` et pas en édition : le `JgrPre` a un bouton ✎ à droite
- En mode édition : textarea pleine avec les boutons "✓ Sauvegarder" / "✕ Annuler"
- Reset automatique de `editingPlan` au changement de tâche