Laissez-moi lire le composant en détail.
Le problème est clair : `loadIssues()` met `loading = true` immédiatement, ce qui efface la liste dans le template (`{#if loading}` → "Chargement..."). Il suffit de distinguer le premier chargement des rechargements.

Fix : utiliser `loading` uniquement quand la liste est vide (premier chargement), et `refreshing` pour les rechargements suivants avec juste un indicateur discret dans le header.
Maintenant, afficher `refreshing` dans le header et supprimer le `setTimeout` inutile (l'issue est déjà ajoutée optimistiquement) :
Supprimer aussi le `setTimeout(loadIssues, 2000)` après création — l'issue est déjà ajoutée à la liste optimistiquement, pas besoin de recharger :
Ajouter le style pour le spinner de refresh :
Voilà. Ce qui change :

- **`loading = true`** uniquement quand la liste est vide (premier chargement) → la liste ne disparaît plus
- **`refreshing`** pour les rechargements suivants → juste un petit `↻` animé dans le header
- **`setTimeout(loadIssues, 2000)` supprimé** → l'issue est déjà ajoutée immédiatement de façon optimiste, inutile de recharger et risquer un flash

Concernant les webhooks GitHub : c'est possible mais nécessite un endpoint public accessible depuis GitHub (ou ngrok en dev). Le polling périodique serait plus simple si tu veux un rafraîchissement automatique — dis-moi si tu veux ça.