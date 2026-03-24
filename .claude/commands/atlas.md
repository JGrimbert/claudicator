# Skill : Navigation par Atlas

Quand cette commande est invoquée (ou quand ATLAS.md est présent), suis ce protocole strict.

## 1. Lire ATLAS.md en premier

Avant tout Glob, Grep ou Bash, lis `ATLAS.md` à la racine du dépôt.

## 2. Utiliser les Points d'entrée directement

Pour chaque fichier listé dans la section **Points d'entrée** :
- Utilise `Read` directement sur le chemin indiqué
- **Ne fais pas** de Glob pour retrouver un fichier déjà listé
- **Ne fais pas** de Grep pour localiser un symbole déjà fourni

## 3. Utiliser les Snippets sans re-lecture

Les snippets dans ATLAS.md contiennent le code source extrait. Utilise-les directement.
- Ne rouvre pas le fichier entier si le snippet couvre la logique dont tu as besoin
- Si tu as besoin de contexte supplémentaire autour du snippet, utilise `Read` avec `offset` et `limit`

## 4. Consulter l'Index pour localiser un symbole

Si tu cherches un symbole qui n'est pas dans les Points d'entrée :
1. Cherche-le dans la section **Index** de ATLAS.md
2. Note le fichier et la ligne
3. `Read` ciblé avec `offset`/`limit`

## 5. Fallback Glob/Grep

Utilise Glob ou Grep seulement si :
- ATLAS.md est absent
- Le symbole ou fichier cherché n'apparaît pas dans ATLAS.md
- Tu as besoin d'explorer un périmètre non couvert par l'Atlas

## Arbre de décision

```
ATLAS.md présent ?
├── OUI → lire ATLAS.md
│         ├── fichier dans Points d'entrée ? → Read direct
│         ├── symbole dans Snippets ? → utiliser snippet
│         ├── symbole dans Index ? → Read ciblé (offset/limit)
│         └── non trouvé → Glob/Grep ciblé
└── NON → exploration classique (Glob/Grep)
```

## Anti-patterns à éviter

- Glob **/*.ts pour trouver un fichier déjà listé dans Points d'entrée
- Grep pour localiser une fonction dont le snippet est déjà dans ATLAS.md
- Lire l'arborescence complète quand les Points d'entrée couvrent le périmètre
- Ouvrir un fichier entier (2000 lignes) quand seul un snippet de 30 lignes est nécessaire
- Re-lire ATLAS.md plusieurs fois dans la même session
