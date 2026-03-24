# Skill : Création d'un plan complet de groupe

Ce skill est invoqué quand l'utilisateur demande un plan complet pour un GROUPE d'issues.

## Protocole

1. **Identifier le groupe** — lire le keyword principal et les sous-stacks
2. **Analyser les dépendances** — quelles issues se bloquent mutuellement ?
3. **Définir l'ordre** — des stacks indépendantes aux stacks dépendantes
4. **Pour chaque sous-stack** : ordre logique, un commit par issue, diff précis attendu

## Format de sortie obligatoire

### Vue d'ensemble
(dépendances inter-stacks, ordre d'implémentation global, risques)

**Dépendances inter-stacks :**
- Stack "X" et stack "Y" sont indépendantes — ordre libre
- #N et #M sont liés : #N est la base

**Infrastructure existante (déjà en place) :**
- (lister ce qui ne doit pas être réimplémenté)

**Risques :**
- (points d'attention)

**Ordre recommandé :** stack "A" en premier puis stack "B"

---

### Stack "<keyword>" (N issues)

#### Étape 1 — #<num> : <titre>
- **Commit :** `type(scope): description`
- **Fichiers touchés :** `src/...`
- **Diff attendu :**
  ```diff
  - ancien code
  + nouveau code
  ```

#### Étape 2 — ...

---

### Résiduel

#### #<num> : <titre>
- Traitement : (description ou "placeholder à clarifier")

## Contraintes

- NE PAS commiter, NE PAS pousser, NE PAS modifier de fichiers
- Produire uniquement un plan textuel structuré
- Chaque étape doit être implémentable indépendamment
- Les diffs doivent être précis (pas de pseudocode)
