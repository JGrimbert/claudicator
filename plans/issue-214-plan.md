Trois problèmes à corriger dans `JgrTabList.svelte` :

1. Supprimer `.tl-row:hover .tl-act { opacity: 1; }` → visible seulement sur la row sélectionnée (`tl-act-vis`)
2. Ajuster `right` pour éviter le chevauchement
3. Enlever la border, augmenter la font-size
Maintenant rebuild le package :
Fait. Résumé des changements :

- **Bouton visible seulement sur row active** : suppression de `.tl-row:hover .tl-act { opacity: 1; }` — le `→` n'apparaît plus au hover sur toutes les rows, uniquement quand la row est sélectionnée (via `tl-act-vis`)
- **Pas de chevauchement** : `right: 1.5rem` quand `.tl-row--with-close` (le X est à `right: 0.3rem`, ~1.2rem de large → espace propre entre les deux)
- **Flèche plus grande, sans cadre** : `border: none`, `font-size: 1rem`, `padding: 0 0.15rem`