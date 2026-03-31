# Skill : TDD d'une issue dans un worktree isolé

Reçoit une issue unique et produit un fichier `.patch` validé (RED → GREEN → SAFE).

## Input attendu

- Numéro et titre de l'issue
- Description / critères d'acceptance
- `$TARGET_PROJECT_PATH` — chemin du projet cible
- `$CLAUDICATOR_PATH` — chemin du dépôt claudicator (destination des patches)

## Protocole

### 1. Créer le worktree

```bash
git -C $TARGET_PROJECT_PATH worktree add /tmp/tdd-issue-<num> HEAD
```

### 2. RED — Écrire le test (contrat)

- Créer ou modifier un fichier de test dans le worktree
- Le test exprime **exactement** le contrat de l'issue (pas plus, pas moins)
- Lancer le test ciblé : **il doit échouer**

```bash
cd /tmp/tdd-issue-<num> && npm test -- <fichier-test>
# attendu : FAIL — si PASS, le test est trivial ou déjà implémenté
```

### 3. GREEN — Implémenter

- Écrire le code minimal pour faire passer le test
- Relancer le test ciblé : **il doit passer**

```bash
cd /tmp/tdd-issue-<num> && npm test -- <fichier-test>
# attendu : PASS
```

Si FAIL → invoquer le skill `repair-loop` avec : contexte d'erreur, phase=GREEN, tentative=1.

### 4. SAFE — Vérifier l'absence de régression

```bash
cd /tmp/tdd-issue-<num> && npm test
# attendu : tous les tests passent
```

Si des tests échouent → invoquer le skill `repair-loop` avec : contexte d'erreur, phase=SAFE, tentative=1.

### 5. Commiter et extraire le patch

```bash
cd /tmp/tdd-issue-<num>
git add -A
git commit -m "type(scope): description (#<num>)"
git format-patch HEAD~1 --stdout > $CLAUDICATOR_PATH/patches/issue-<num>-<slug>.patch
```

### 6. Nettoyer le worktree

```bash
git -C $TARGET_PROJECT_PATH worktree remove /tmp/tdd-issue-<num> --force
```

## Output

- **Succès** : chemin du patch généré + résumé (N tests ajoutés, 0 régressions)
- **Échec** : rapport de blocage issu de `repair-loop` (cause, correctifs tentés, suggestion)

### 7. Mettre à jour l'expérience des clusters

Invoquer le skill `update-skill` en lui fournissant :
- Le numéro de l'issue
- Les fichiers modifiés (issus du commit dans le worktree)
- Un résumé des difficultés rencontrées (pitfalls, patterns, leçons)

Cette étape est **obligatoire**, même si aucune mise à jour n'est effectuée (le skill évalue lui-même la pertinence).

## Contraintes

- NE JAMAIS modifier les fichiers source du dépôt principal
- NE PAS commiter dans le dépôt principal
- Un seul commit dans le worktree = un seul patch
- En cas de blocage après `repair-loop` : retourner le rapport sans patch, ne pas bloquer le flux
