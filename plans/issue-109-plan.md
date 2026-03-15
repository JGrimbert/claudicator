Je dois lire le fichier entier, notamment la partie HTML avec les boutons. Laissez-moi rechercher directement les parties pertinentes.
Maintenant je cherche la "row des artefacts" pour comprendre sa structure.
Maintenant je dois voir le contexte dans `+page.svelte` pour comprendre la "row des artefacts" et où le bouton Task est situé.
J'ai trouvé le bouton "Task". Il est dans la `plan-header` (bas du composant `ArtifactViewer`). Je vais le déplacer dans le `panel-header` (haut) avec le style bleu cornsilk comme `ai-launch`.
Maintenant j'ajoute le CSS pour le nouveau bouton et supprime l'ancien style `.plan-btn` :
Le bouton "Task →" est maintenant déplacé dans le `panel-header` (haut de la row artefacts), avec fond `#1e1540` (bleu nuit) et texte cornsilk, identique au style "Lancer l'agent →". Il disparaît de la `plan-header` du bas.