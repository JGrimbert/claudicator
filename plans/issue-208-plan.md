Maintenant cherchons où l'overlay est utilisé dans le template de `ArtifactViewer.svelte`.
J'ai tout ce qu'il faut. Voici le plan :

1. **ArtifactViewer** : supprimer l'overlay, le timer spinner, la CSS associée, et le `style="position: relative;"` du div `.content`
2. **ProjetPanel** : ajouter `pending: $issueListPendingNumber !== null` sur l'onglet issues
Maintenant `ProjetPanel.svelte` — ajouter `pending` sur l'onglet issues :
Vérifions que tout est cohérent :
Propre. `issueListPendingNumber` est encore importé uniquement pour le `.set()` après création d'issue — c'est correct.
Fait. Résumé des changements :

**ArtifactViewer.svelte** :
- Supprimé l'overlay (`.refresh-overlay`), le timer braille, et le `onDestroy`
- Supprimé le CSS `.refresh-overlay` + `.spinner-braille`
- Supprimé `style="position: relative;"` du div `.content`

**ProjetPanel.svelte** :
- Ajouté `pending: $issueListPendingNumber !== null` sur l'onglet issues → le `JgrTabList` affiche l'état `stale` (class `.tl-list.stale`) pendant le refresh de la liste après création d'une issue