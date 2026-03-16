L'infrastructure de base existe déjà. Laisse-moi vérifier l'état actuel de l'UI pour voir ce qui manque exactement.
Je vois que la logique de fermeture existe dans `TaskList.svelte` mais seulement pour les issues liées à des tasks. Laisse-moi vérifier la vue principale d'une issue.
`ItemRow` a déjà un prop `action` prévu pour ça. Je vais ajouter un bouton "Fermer" dans `IssueList.svelte` pour chaque issue.
C'est en place. Chaque issue dans la liste a maintenant un bouton "Fermer" qui :
1. Appelle `POST /api/issues/{number}/close` (route déjà existante)
2. Affiche "…" pendant la requête
3. Affiche "✓" une fois fermée
4. Rafraîchit la liste après 800ms (l'issue disparaît)