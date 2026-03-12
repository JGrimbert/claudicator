Laissez-moi examiner les fichiers modifiés et le workflow actuel.
Laissez-moi lire le TaskList.svelte complet.
Laissez-moi examiner les routes API du diff et du commit.
J'ai trouvé le bug. Dans `/api/agent/run`, après l'implémentation réussie, le statut passe à `"documentation"`. Et dans `currentStep` côté client :

```ts
if (selected?.status === "documentation" || selected?.status === "validation") return 3;
```

Ce `return 3` (Push) s'active immédiatement, **avant même que le diff soit chargé**, ce qui fait que le bouton "Commiter" apparaît comme déjà passé (secondary) même s'il y a des modifications non commitées.

La correction : déplacer ce fallback après la vérification du diff, pour que le diff ait la priorité sur le statut.
**Cause du bug** : Après que l'agent d'implémentation se termine, le serveur met le statut à `"documentation"`. Le client récupère ce statut via `loadTasksSilent()` et `currentStep` passait immédiatement à 3 (Push) à cause du check en tête de fonction — même si des modifications non commitées existaient.

**Correction** : Le diff prend maintenant la priorité. Si `diffContent` est non-vide, on est à l'étape 2 (Commit), quel que soit le statut. Le fallback sur le statut ne s'applique que quand le diff n'est pas encore chargé.