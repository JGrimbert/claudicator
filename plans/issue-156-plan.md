Laisse-moi lire les fichiers directement pour voir la structure exacte.
J'ai compris la situation :
- "Nouvelle issue" est dans la row de tabs de ProjetPanel → à déplacer dans le `panel-header` d'ArtifactViewer
- Le bouton "Task →" dans le header n'a pas de background, donc le contenu scrollable peut passer visuellement par-dessus

Voici les changements à faire :
Maintenant fix le CSS du `panel-header` pour éviter que le contenu scrollable passe par-dessus, et ajouter les styles pour les nouveaux éléments :
Maintenant, retirer "Nouvelle issue" de ProjetPanel et IssuesTodoPanel :
Aussi nettoyer le CSS `.tab-cta` qui n'est plus utile dans ces deux fichiers :
Voilà. Récapitulatif des changements :

**ArtifactViewer.svelte** :
- Ajout de `openCreate()` qui remet `issue` à null et vide le formulaire
- Le panel-header montre maintenant un bloc `.header-right` avec `margin-left: auto` qui contient :
  - "Task →" (si une issue est sélectionnée et sans task)
  - "+ Issue" toujours visible
- `.panel-header` a maintenant `background: var(--bg-panel)` + `position: relative; z-index: 1` → le header reste visuellement au-dessus du textarea scrollable

**ProjetPanel.svelte** + **IssuesTodoPanel.svelte** :
- Supprimé le bouton "Nouvelle issue" et les imports/fonctions associés (`CtaButton`, `agentState`, `openCreate`)