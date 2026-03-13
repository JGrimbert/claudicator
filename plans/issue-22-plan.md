Bien, je vois le CSS en place. Laisse-moi lire la partie JS.
Toutes les localisations sont confirmées. J'implémente les 4 étapes en parallèle.
4 étapes appliquées :

| Étape | Changement |
|-------|-----------|
| **A** — CSS arrowhead | `fill: none` + `stroke` + `opacity: 0.6` |
| **B** — JS markers | Réduction × 0.6 de `markerWidth`/`markerHeight` |
| **C** — CSS chips | `margin-top: 0.5rem` |
| **D** — JS padH | `16` → `28` |

À vérifier visuellement :
- Pointes ouvertes (non remplies), visibles sur fond sombre
- Pointes plus petites qu'avant
- Espace entre le nom du groupe et les chips
- Noeuds sans chips pas trop hauts malgré `padH = 28`