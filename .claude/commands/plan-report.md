# Skill : Rapport de plan complet

Reçoit les résultats de tous les `tdd-issue` et produit le rapport final.

## Input attendu

Liste des résultats par issue :
- `num` : numéro de l'issue
- `statut` : `ok` | `bloqué`
- `patch` : chemin du fichier patch (si ok)
- `tests` : résumé (N ajoutés, 0 régressions)
- `rapport_blocage` : contenu du rapport repair-loop (si bloqué)

## Format de sortie obligatoire

```
## Résultat du plan complet

| Issue | Statut   | Patch                            | Tests                          |
|-------|----------|----------------------------------|--------------------------------|
| #42   | ✓        | patches/issue-42-add-login.patch | 2 tests ajoutés, 0 régressions |
| #43   | ✓        | patches/issue-43-fix-auth.patch  | 1 test ajouté, 0 régressions   |
| #47   | ⚠ bloqué | —                                | suite échoue (détail ci-dessous) |

---

### Issues bloquées

#### #47 — <titre>
(contenu du rapport de blocage issu de repair-loop)

---

### Patches prêts à appliquer

Appliquer dans cet ordre :

```bash
git apply patches/issue-42-add-login.patch && git commit
git apply patches/issue-43-fix-auth.patch  && git commit
```

---

### Résiduel (non traité dans ce cycle)

- #X : (raison issue de analyze-group)
```

## Contraintes

- Ne pas modifier de fichiers
- Ne pas relancer de tests
- Présenter uniquement la synthèse des résultats reçus
