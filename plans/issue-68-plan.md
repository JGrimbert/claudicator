Laisse-moi regarder la structure actuelle.
Laisse-moi voir la navigation automatique vers la console dans `+page.svelte`.
Laisse-moi voir le CSS de `RunConsole` pour comprendre la mise en page.
Laisse-moi voir ce qu'est `AgentConsole` (en bas du main).
Je comprends le problème. L'`input-bar` est dans `RunConsole` (onglet "console"), donc quand l'utilisateur est sur l'onglet "plan" ou "roadmap", il ne peut pas saisir de suivi. La solution : sortir la barre de saisie de `RunConsole` et la mettre au niveau global du `main`, toujours visible quelle que soit l'onglet actif.

Voici le plan :
- Extraire l'`input-bar` + sa logique de `RunConsole` vers `+page.svelte`
- L'afficher en bas du `main` quand `running || sessionAlive`
- Dans `RunConsole`, garder uniquement les logs et le header

Confirmation avant de modifier ?