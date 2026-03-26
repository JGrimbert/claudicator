# Skill : Boucle de réparation TDD

Reçoit un contexte d'échec de test et tente de corriger le worktree. Max 3 tentatives.

## Input attendu

- `phase` : GREEN (test ciblé échoue) ou SAFE (régression sur suite complète)
- `tentative` : numéro de tentative actuelle (1, 2 ou 3)
- `worktree` : chemin du worktree `/tmp/tdd-issue-<num>`
- `erreur` : message d'erreur complet (stack trace, assertion échouée)
- `fichier-test` : fichier de test ciblé (pour phase GREEN)

## Protocole par tentative

### Étape 1 — Analyser l'erreur

Lire attentivement :
- Le message d'assertion (valeur attendue vs reçue)
- La stack trace (quel fichier, quelle ligne)
- Le nom du test échoué

### Étape 2 — Classifier la cause

| Cause | Action corrective |
|-------|-------------------|
| Implémentation incorrecte | Corriger le code source dans le worktree |
| Test trop strict / mauvaise hypothèse | Corriger le test sans affaiblir le contrat |
| Régression : changement casse un test existant | Ajuster l'implémentation pour préserver le comportement existant |
| Conflit inter-issues : dépendance manquante | Signaler à l'orchestrateur — réordonner les issues |
| Cause inconnue | Tenter une approche alternative avant d'abandonner |

### Étape 3 — Appliquer le correctif

Modifier le(s) fichier(s) concerné(s) dans le worktree uniquement.

### Étape 4 — Relancer

```bash
# Phase GREEN : test ciblé uniquement
cd <worktree> && npm test -- <fichier-test>

# Phase SAFE : suite complète
cd <worktree> && npm test
```

## Décision après relance

- **PASS** → retourner succès à `tdd-issue`, qui continue vers l'étape suivante
- **FAIL et tentative < 3** → incrémenter tentative, reprendre depuis Étape 1
- **FAIL et tentative = 3** → retourner un rapport de blocage (voir format ci-dessous)

## Format du rapport de blocage (tentative 3 épuisée)

```
## Blocage — issue #<num> (phase <GREEN|SAFE>)

**Cause identifiée :** (description précise)

**Correctifs tentés :**
1. Tentative 1 : (ce qui a été modifié, pourquoi ça n'a pas suffi)
2. Tentative 2 : (idem)
3. Tentative 3 : (idem)

**Erreur persistante :**
(dernier message d'erreur)

**Suggestion de résolution manuelle :**
(piste concrète pour débloquer à la main)
```

## Contraintes

- Ne modifier que les fichiers dans le worktree
- Ne jamais affaiblir le contrat du test (ne pas supprimer des assertions pour faire passer)
- En cas de conflit inter-issues : ne pas tenter de corriger — signaler immédiatement à l'orchestrateur
