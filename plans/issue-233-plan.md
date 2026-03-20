Je vais implémenter le plan en 5 éditions séquentielles sur ce seul fichier.
Vérification du résultat final :
Tout est en place. Résumé des changements :

- **`stem()`** (ligne 44) — normalise `tokens` → `token`, `issues` → `issue`, `stories` → `story`, etc.
- **`issueTokens`** — passé de `Map<number, Set<string>>` à `Map<number, Map<stem, originalToken>>`, ce qui fusionne `"token"` et `"tokens"` sous la même clé `"token"`
- **`wordFreq`** — compte désormais les stems, donc `"token"` + `"tokens"` cumulent leurs fréquences
- **`candidateGroups`** — filtre par stem, un seul groupe candidat pour les deux formes
- **Étape 7** — remonte la forme originale la plus fréquente (`"token"` ou `"tokens"`) comme `keyword` affiché