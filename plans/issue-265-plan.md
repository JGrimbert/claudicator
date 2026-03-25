Aucun textarea dans PlanPanel. Regardons la page principale.
PlanPanel est trop grand pour lire en entier. Cherchons la partie pertinente.
Trouvé ! C'est dans `ArtifactViewer.svelte`. Lisons le CSS.
Diagnostic complet. Problèmes dans `ArtifactViewer.svelte` :

1. **`resize: none`** dans `.edit-inline` → override absent dans `.edit-inline--body`
2. **`min-height: 0`** dans `.edit-inline--body` → la textarea peut se réduire à 0 px (pas de contrainte de hauteur sur `.issue-body`)
3. **`flex: 1`** sans hauteur parente contrainte → inutile, la textarea s'effondre sur sa taille intrinsèque (1 ligne)

Deux lignes à changer dans `.edit-inline--body` :
Fait. Les changements :

- `flex: 1` supprimé → n'avait aucun effet (`.issue-body` n'a pas de hauteur contrainte)
- `min-height: 0` → `min-height: 10rem` → taille minimale visible même avec les symboles en dessous
- `resize: vertical` ajouté → écrase le `resize: none` hérité de `.edit-inline`, le handle de redimensionnement est maintenant disponible