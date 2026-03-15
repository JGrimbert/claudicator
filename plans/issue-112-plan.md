Ce n'est pas dans ArtifactViewer. Je cherche le composant qui affiche le preprompt ATLAS.
Deux problèmes clairs dans `AgentInput.svelte` :
1. `.ro-pre` a `max-height: 72px; overflow-y: auto;` → les petits scrollbars dans PLAN, DOCUMENTATION, ATLAS
2. Le toggle "plan" est dans le footer au lieu d'être entre l'input et le contenu plan
Maintenant déplacer le toggle "plan" du footer vers entre l'input et la section PLAN :
Maintenant retirer le toggle "plan" du footer :
Ajouter le style pour `sec-plan-toggle` :
Voilà les deux corrections :

1. **Scrollbars supprimés** — `.ro-pre` n'a plus `max-height: 72px` ni `overflow-y: auto`, donc PLAN, DOCUMENTATION et ATLAS s'affichent en entier sans ascenseur.

2. **Toggle plan repositionné** — il apparaît maintenant directement entre l'input utilisateur et l'arbo de plan (dans le `doc-scroll`), et a été retiré du footer.