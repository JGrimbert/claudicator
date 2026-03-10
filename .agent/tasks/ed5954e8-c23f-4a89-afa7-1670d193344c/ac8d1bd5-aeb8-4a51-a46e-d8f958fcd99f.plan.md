Laisse-moi d'abord regarder l'état actuel des tasks et le code concerné.
La task est en `status: "running"` dans un sous-dossier de projet. Regardons le composant TaskList et les routes de merge.
Maintenant voyons le service git pour les fonctions disponibles.
Très clair. Il faut :
1. Corriger la task actuelle (status `running` → `done`) manuellement
2. Dans la route merge, ajouter `git checkout main` + `git pull` après le merge GitHub

Commençons par corriger la task stale :
Maintenant ajoutons `checkoutMain` à git.ts et mettons à jour la route merge pour checkout main après le merge GitHub :
Maintenant mettons à jour la route merge pour appeler `checkoutMain` :
Vérifions le résultat final :
Voilà. Résumé des changements :

1. **Task #13 corrigée** : `status: "running"` → `"done"` directement dans le JSON (`.agent/tasks/.../ac8d1bd5....json`) puisque le merge avait été fait hors de l'app.

2. **`checkoutMain(root)`** ajouté à `git.ts` : fait un `git checkout main` + `git pull origin main` sur le projet cible.

3. **Route `/api/tasks/[id]/merge`** : appelle `checkoutMain(root)` après le merge GitHub PR, avant de retourner le task mis à jour en `"done"`.

Désormais, chaque fois qu'un merge est déclenché via Claudicator, le repo cible se repositionne automatiquement sur `main` à jour.