Laisse-moi vérifier les stores pour comprendre le problème de réactivité.
Laisse-moi chercher comment `contextState` est mis à jour lors de la navigation.
Maintenant j'ai une vue complète. Voici les 3 changements à faire :

1. **Réactivité** : fix dans `AgentConsole.svelte` pour que les issues déclenchent aussi une mise à jour
2. **Supprimer le bandeau de recherche** dans `SymbolsView.svelte`
3. **Toggle du corps** au clic sur l'en-tête
Maintenant, je réécris `SymbolsView.svelte` pour supprimer la barre de recherche et ajouter le toggle :
Les 3 changements sont faits :

**`SymbolsView.svelte`** :
- Barre de recherche (input + bouton `→`) supprimée
- Corps des fonctions (`codeSnippet`/`snippetError`) masqué par défaut, affiché au clic sur l'en-tête
- Réinitialise les éléments ouverts à chaque nouvelle recherche auto

**`AgentConsole.svelte`** :
- Tracking séparé de `planModeTask` et `agentState.issue` avec "dernier écrit gagne" — quand on navigue vers une issue, `symbolsQuery` prend le titre de l'issue même si une task est encore sélectionnée