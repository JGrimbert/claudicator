# Plan : Réduire le bruit du contexte agent

## Problème

`loadSymbolMap` dans `context.ts` charge toutes les méthodes de `method-index.json`
sans filtrage. Résultat : SYMBOL MAP = toute la codebase → bruit maximal.

## Solution

Scorer chaque méthode contre le titre de la tâche avant de construire le Symbol Map.
Même principe que `MethodSearch`, mais sans dépendre de `ContextAgent`.

### Scoring (simple, server-side)

Pour chaque méthode de l'index :
- +3 si un mot du titre apparaît dans le nom de la méthode
- +2 si un mot apparaît dans le nom de la classe
- +1 si un mot apparaît dans la description JSDoc

Garder les N classes avec le meilleur score agrégé (défaut : 12 classes max).
Si aucun score > 0 (requête trop vague) : garder les N premières par ordre alphabétique.

### Call Graph

Déjà filtré automatiquement : `knownClasses` est dérivé du `symbolMap` filtré.
Moins de classes connues → moins d'arêtes → call graph plus lisible.

## Fichier modifié

- `src/lib/server/agent/context.ts` — `loadSymbolMap(projectRoot, query, maxClasses)`

## Résultat attendu

Prompt ~1000–2000 tokens au lieu de 3000–4000, avec un ratio signal/bruit bien supérieur.
