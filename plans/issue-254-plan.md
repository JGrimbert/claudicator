J'ai tout ce qu'il me faut. Voici les changements :

1. `.content` → `display: flex; flex-direction: column` pour que ses enfants puissent grandir
2. `.create-row` → `flex: 1; min-height: 0` pour remplir tout l'espace
3. `.edit-inline--body` → `flex: 1; min-height: 0` (remplace `min-height: 4rem`)
4. `:focus` → fond plus sombre + transition
C'est fait. Résumé des changements dans `ArtifactViewer.svelte` :

- **`.content`** : ajout de `display: flex; flex-direction: column` → les enfants peuvent prendre `flex: 1`
- **`.create-row`** : ajout de `flex: 1; min-height: 0` → remplit tout l'espace sous le header
- **`.edit-inline--body`** : `min-height: 4rem` remplacé par `flex: 1; min-height: 0` + `transition: background 0.15s`
- **`.edit-inline--body:focus`** : fond `rgba(0,0,0,0.35)` + `border-radius` + padding au focus