# Skill : Analyse d'un groupe d'issues

Reçoit une liste d'issues et produit un plan d'ordre d'implémentation avec dépendances.

## Input attendu

Liste d'issues sous une forme quelconque : numéros, titres, descriptions, labels.

## Protocole

1. Lire chaque issue (contenu, labels, sous-issues éventuelles)
2. Identifier les dépendances fonctionnelles : quelle issue doit précéder une autre ?
3. Regrouper par stack thématique (keyword commun, domaine fonctionnel)
4. Identifier ce qui est déjà en place (ne pas réimplémenter)
5. Évaluer les risques (couplage fort, zones fragiles, ambiguïtés)

## Format de sortie obligatoire

```
## Analyse du groupe

**Stacks identifiées :**
- Stack "<keyword>" : #N, #M, #P
- Stack "<keyword>" : #Q, #R

**Dépendances :**
- #N → #M (M ne peut pas être implémentée sans N)
- Stack "X" et stack "Y" sont indépendantes — ordre libre

**Infrastructure existante (ne pas réimplémenter) :**
- (liste des éléments déjà présents dans le code)

**Risques :**
- (points d'attention, zones de couplage, issues ambiguës)

**Ordre d'exécution recommandé :**
1. #N — <titre>
2. #M — <titre>
3. #P — <titre>
...

**Résiduel (non traitables dans ce cycle) :**
- #X : raison (trop vague, dépendance externe, hors périmètre)
```

## Contraintes

- Ne pas implémenter, ne pas générer de patch
- Produire uniquement l'analyse et l'ordre
- L'ordre doit être exploitable directement par `tdd-issue`
