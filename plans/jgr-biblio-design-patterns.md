# Plan — jgr-biblio : Synthèse Design Patterns (refactoring.guru)

Source : https://refactoring.guru/fr/design-patterns/catalog
Objectif : Produire un `.md` structuré comme première brique du repo `jgr-biblio`,
puis simuler la navigation du site dans lolve.

---

## 1. Analyse du problème

### Périmètre

Le site refactoring.guru recense **23 patrons de conception** issus du GoF (Gang of Four),
répartis en 3 familles. Chaque patron suit une structure canonique :
- Intention (intent)
- Problème résolu
- Solution proposée
- Structure (participants UML)
- Quand l'utiliser
- Avantages / Inconvénients
- Relations avec d'autres patrons
- Exemples de code (multi-langages)

### Ce que le `.md` doit apporter

1. **Arbre complet** des 3 familles → 23 patrons, consultable en un coup d'œil
2. **Fiche synthèse** par patron (intention + structure + quand utiliser + pro/con)
3. **Graphe des relations** inter-patrons (liens explicites entre les fiches)
4. **Regroupements thématiques** transverses (ex : famille "undo/redo", famille "injection de dépendances")

---

## 2. Localisation des usages (inventaire du contenu)

### Famille Création — 5 patrons
Thème : instanciation flexible, découplage des types concrets.

| # | FR | EN | Rôle résumé |
|---|---|---|---|
| C1 | Fabrique | Factory Method | Déléguer la création d'objets à des sous-classes |
| C2 | Fabrique abstraite | Abstract Factory | Créer des familles d'objets liés sans spécifier leurs classes |
| C3 | Monteur | Builder | Construire des objets complexes étape par étape |
| C4 | Prototype | Prototype | Cloner des objets existants |
| C5 | Singleton | Singleton | Garantir une instance unique |

### Famille Structurelle — 7 patrons
Thème : composition d'objets et de classes en structures plus grandes.

| # | FR | EN | Rôle résumé |
|---|---|---|---|
| S1 | Adaptateur | Adapter | Faire collaborer des interfaces incompatibles |
| S2 | Pont | Bridge | Séparer abstraction et implémentation |
| S3 | Composite | Composite | Traiter objets simples et complexes uniformément (arbre) |
| S4 | Décorateur | Decorator | Ajouter des comportements dynamiquement |
| S5 | Façade | Facade | Interface simplifiée sur un sous-système complexe |
| S6 | Poids mouche | Flyweight | Partager les parties communes d'état pour économiser la RAM |
| S7 | Procuration | Proxy | Substitut/représentant d'un autre objet |

### Famille Comportementale — 11 patrons
Thème : algorithmes et répartition des responsabilités entre objets.

| # | FR | EN | Rôle résumé |
|---|---|---|---|
| B1 | Chaîne de responsabilité | Chain of Responsibility | Passer une requête le long d'une chaîne de handlers |
| B2 | Commande | Command | Encapsuler une requête comme un objet |
| B3 | Itérateur | Iterator | Parcourir une collection sans exposer sa structure |
| B4 | Médiateur | Mediator | Réduire les dépendances chaotiques entre objets |
| B5 | Mémento | Memento | Sauvegarder et restaurer l'état d'un objet |
| B6 | Observateur | Observer | Mécanisme de souscription/notification |
| B7 | État | State | Modifier le comportement selon l'état interne |
| B8 | Stratégie | Strategy | Définir une famille d'algorithmes interchangeables |
| B9 | Patron de méthode | Template Method | Squelette d'algorithme avec étapes redéfinissables |
| B10 | Visiteur | Visitor | Opérations sur éléments d'une structure sans les modifier |

---

## 3. Stratégie de structuration du `.md`

### Structure du fichier `design-patterns.md`

```
# Design Patterns — Synthèse GoF

## Vue d'ensemble (arbre)
  Création (5)
  Structurel (7)
  Comportemental (11)

## Famille Création
  ### C1 — Fabrique
  ### C2 — Fabrique abstraite
  ...

## Famille Structurelle
  ### S1 — Adaptateur
  ...

## Famille Comportementale
  ### B1 — Chaîne de responsabilité
  ...

## Graphe des relations
  (tableau croisé ou liste de liens)

## Regroupements thématiques transverses
  - Famille Injection de dépendances
  - Famille Undo/Redo
  - Famille Evénementielle
  - Famille Algorithmes
```

### Format d'une fiche patron

```markdown
### C1 — Fabrique (Factory Method)

**Intention** : ...
**Problème** : ...
**Solution** : ...
**Participants** : Creator · ConcreteCreator · Product · ConcreteProduct
**Quand l'utiliser** : ...
**Pro** : ...  **Con** : ...
**Liens** : → [C2 Fabrique abstraite] · → [C3 Monteur] · → [C4 Prototype]
```

---

## 4. Étapes de production du `.md`

### Étape 1 — Scrape structuré du catalogue (1 passe)
- Lire la page catalogue pour extraire le nom FR/EN + URL de chacun des 23 patrons
- Source : https://refactoring.guru/fr/design-patterns/catalog

### Étape 2 — Scrape de chaque patron (23 passes)
Pour chaque URL patron, extraire :
- Intention (paragraphe d'intent)
- Participants (liste des classes du diagramme UML)
- Cas d'utilisation (liste "quand utiliser")
- Avantages/Inconvénients (listes)
- Patrons liés (section "Relations avec d'autres patrons")

Priorité de scrape suggérée :
1. Création (5) — base pour comprendre les structurels
2. Structurels (7) — pas de dépendances entre eux
3. Comportementaux (11) — les plus interdépendants

### Étape 3 — Rédaction des fiches
- Synthétiser le contenu en ~5 lignes par patron (pas de copier-coller verbatim)
- Normaliser le vocabulaire FR (utiliser les noms français du site)
- Identifier et lier les patrons relatifs dans chaque fiche

### Étape 4 — Construction du graphe des relations

Relations connues à documenter :

| Depuis | Vers | Nature du lien |
|---|---|---|
| Fabrique | Fabrique abstraite | "évolue vers" |
| Fabrique | Prototype | "alternative" |
| Fabrique | Monteur | "alternative" |
| Fabrique abstraite | Fabrique | "utilise souvent" |
| Fabrique abstraite | Prototype | "implémentation possible" |
| Monteur | Composite | "construit des arbres" |
| Singleton | Fabrique abstraite | "combiné avec" |
| Adaptateur | Décorateur | "structure similaire" |
| Adaptateur | Procuration | "structure similaire" |
| Pont | Stratégie | "structure similaire" |
| Composite | Itérateur | "parcourir l'arbre" |
| Composite | Visiteur | "opérer sur l'arbre" |
| Composite | Décorateur | "collaboration fréquente" |
| Décorateur | Chaîne de responsabilité | "structure similaire" |
| Commande | Mémento | "undo/redo ensemble" |
| Commande | Chaîne de responsabilité | "souvent combinés" |
| Observateur | Médiateur | "distinction clé" |
| Stratégie | Patron de méthode | "alternative" |
| État | Stratégie | "structure similaire" |
| Visiteur | Itérateur | "combinés" |

### Étape 5 — Regroupements thématiques transverses
Ajouter une section finale avec des "familles" non-officielles :

- **Injection de dépendances** : Fabrique, Fabrique abstraite, Monteur
- **Undo/Redo** : Commande + Mémento
- **Événementiel / Observable** : Observateur, Médiateur, Commande
- **Algorithmes interchangeables** : Stratégie, Patron de méthode, État
- **Structure arborescente** : Composite + Itérateur + Visiteur
- **Wrappers** : Adaptateur, Décorateur, Procuration, Façade

### Étape 6 — Init du repo `jgr-biblio`
```
jgr-biblio/
  design-patterns.md        ← livrable de ce plan
  README.md                 ← présentation du repo
  index.json                ← index machine-readable des patrons (pour lolve)
```

`index.json` structure suggérée :
```json
[
  {
    "id": "factory-method",
    "fr": "Fabrique",
    "family": "creation",
    "intent": "...",
    "links": ["abstract-factory", "builder", "prototype"]
  }
]
```

---

## 5. Vérifications et nettoyage final

### Complétude
- [ ] 23 patrons présents (5 + 7 + 11)
- [ ] Chaque fiche contient : intention, participants, quand utiliser, pro/con, liens
- [ ] Tous les liens sont bidirectionnels (si A → B, vérifier B → A)

### Cohérence
- [ ] Vocabulaire FR unifié (pas de mélange FR/EN dans les titres)
- [ ] Relations du graphe vérifiées contre le site (section "Relations" de chaque page)
- [ ] Regroupements thématiques justifiés (pas d'invention)

### Utilisabilité pour lolve
- [ ] `index.json` parseable sans erreur
- [ ] Chaque entrée a un `id` en kebab-case correspondant à l'URL refactoring.guru
- [ ] Les `links` n'utilisent que des `id` existants dans l'index

### Extensibilité pour jgr-biblio
- [ ] Structure du `.md` reproductible pour d'autres catalogues (SOLID, DDD, etc.)
- [ ] Le format de fiche est documenté dans le README

---

## Résumé des livrables

| Livrable | Chemin | Description |
|---|---|---|
| Synthèse MD | `jgr-biblio/design-patterns.md` | 23 fiches + graphe + regroupements |
| Index JSON | `jgr-biblio/index.json` | Version machine-readable pour lolve |
| README | `jgr-biblio/README.md` | Présentation du repo biblio |
