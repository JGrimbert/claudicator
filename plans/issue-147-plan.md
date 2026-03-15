Laisse-moi regarder les composants existants pour comprendre le style des boutons CTA et où se trouve actuellement le bouton de création d'issue.
J'ai tout ce qu'il me faut. Voici le plan :
1. Créer `CtaButton.svelte` — composant bouton CTA avec spinner, `data-use-case` et `data-cta`
2. L'utiliser dans le header de `IssueList.svelte` pour "Nouvelle issue →"
Maintenant, ajouter le bouton dans le header de `IssueList.svelte` :
Le composant `CtaButton` est créé et placé dans le header. Voyons si le `+` dans `ProjetPanel` est redondant maintenant. Comme `hideHeader={true}` est passé à IssueList depuis ProjetPanel, le bouton du header IssueList ne s'affiche pas là. Le `+` de ProjetPanel reste utile pour ce contexte. 

Si tu veux qu'il utilise aussi le style CTA dans ProjetPanel, dis-le moi — sinon c'est propre tel quel : le composant `CtaButton` est disponible partout.

**Résumé :**
- `src/lib/components/CtaButton.svelte` — nouveau composant avec `data-use-case`, `data-cta`, spinner braille, style identique à "Lancer l'agent →"
- `IssueList.svelte` — bouton "Nouvelle issue →" dans le header, appelle `openCreate()` (vide la sélection pour afficher le formulaire de création dans ArtifactViewer)