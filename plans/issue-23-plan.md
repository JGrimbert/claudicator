Je vais d'abord lire les 5 fichiers concernés pour trouver les occurrences exactes.
Les occurrences correspondent exactement au plan. Je vais tout faire en parallèle.
Vérification finale — aucune occurrence `cornsilk` ne doit subsister :
C'est la déclaration dans `:root` — c'est correct, c'est là qu'elle doit vivre.

**Implémentation terminée.**

- `+layout.svelte` : `--color-impl: cornsilk;` ajouté dans `:root`
- 6 occurrences remplacées par `var(--color-impl)` dans les 4 composants
- 0 occurrence résiduelle hors de la déclaration centrale