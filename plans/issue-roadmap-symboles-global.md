# Plan : Agent Roadmap — Signature Symbolique & Hiérarchie Top-Issues

## 1. Analyse du problème

### Situation actuelle

L'agent roadmap regroupe les issues par **thématique fonctionnelle** via un prompt Claude. Les sub-issues sont récupérées depuis l'API GitHub (relation parent → enfants nommée dans les issues GitHub). Elles sont filtrées de la liste principale (`knownSubIssueNumbers`) pour ne pas apparaître en doublon.

Le groupement actuel est **purement textuel** : Claude analyse les titres et descriptions, sans connaissance du code touché.

### Problème à résoudre

Les issues n'ont pas de **signature symbolique** (= ensemble de symboles du codebase qu'elles touchent). Sans cela :

- Deux issues qui modifient le même fichier/fonction peuvent atterrir dans des groupes différents
- La roadmap n'informe pas Claude des contraintes de couplage technique
- Les lots d'issues couplées peuvent être fragmentés sur des étapes différentes, causant des conflits

### Solution proposée

1. **Calculer une signature symbolique** pour chaque issue (liste de clés de symboles retournés par la cartographie)
2. **Détecter les chevauchements** : si deux issues partagent ≥ 1 symbole commun, les regrouper en **top-issue synthétique**
3. **Trier les top-issues en priorité** dans la roadmap
4. **Contraindre** : les sub-issues d'un même cluster ne peuvent pas être séparées sur des étapes différentes
5. **Afficher** les clusters dans des encadrés visuels (border colorée)
6. **Propager** cette hiérarchie dans le prompt envoyé à Claude

---

## 2. Localisation des usages

### Fichiers côté serveur

| Fichier | Rôle actuel | Modification |
|---|---|---|
| `src/lib/server/agent/issue-analysis.ts` | Prépare les issues, construit les prompts | Ajouter enrichissement symbolique + nouvelle logique de clustering |
| `src/lib/server/services/cartography.ts` | Recherche de symboles dans la codebase | Utiliser `searchMethods()` pour requêter les symboles par issue |
| `src/routes/api/issues/analyze/+server.ts` | Pipeline d'analyse complète | Appeler l'enrichissement symbolique dans le pipeline `prepareIssues` |
| `src/routes/api/issues/analyze/update/+server.ts` | Mise à jour incrémentale | Idem : enrichir les nouvelles issues avec leurs symboles |

### Fichiers côté client

| Fichier | Rôle actuel | Modification |
|---|---|---|
| `src/lib/stores/agent.ts` | Types `PlanGroup`, `Issue`, store `issueAnalysis` | Ajouter type `TopIssueGroup`, enrichir `PlanGroup` avec `isTopIssue` et `childIssues` |
| `src/lib/components/IssueAnalysis.svelte` | Affichage des groupes + roadmap Mermaid | Afficher les top-issues dans des encadrés avec border colorée, imbriquer les sub-issues |

### Fichiers de types

| Fichier | Rôle actuel | Modification |
|---|---|---|
| `src/lib/types/symbols.ts` | `SymbolEntry` | Aucune modification requise |

---

## 3. Stratégie d'extension

### A. Calcul de la signature symbolique

Pour chaque `PreparedIssue`, appeler `searchMethods(query, projectRoot)` avec comme requête : `issue.title + " " + issue.preparedBody` (200 premiers caractères).

Stocker le résultat dans un nouveau champ `symbols: string[]` (liste de clés de symboles, ex: `"auth.ts:validateToken"`).

**Seuil** : ne conserver que les symboles avec un score suffisant (à définir, ex : top 5 résultats).

**Concurrence** : limiter à 3 appels cartographie simultanés (éviter saturation).

### B. Algorithme de clustering symbolique

Après enrichissement, calculer les chevauchements :

```
Pour chaque paire (issueA, issueB) :
  intersection = symboles(A) ∩ symboles(B)
  Si |intersection| >= 1 : ajouter dans le même cluster
```

Utiliser un **union-find** simple pour fusionner les clusters transitifs (si A~B et B~C → A, B, C dans le même cluster).

Résultat : liste de `SymbolCluster { id: string; issues: number[]; symbols: string[] }`

**Seuil minimum** : un cluster n'est créé que si ≥ 2 issues le composent.

### C. Top-issues synthétiques

Pour chaque cluster de taille ≥ 2 :
- Créer un `TopIssue` synthétique avec :
  - `id: "cluster-<hash>"` (hash des numéros d'issues)
  - `title: "<Symbole principal> — <N> issues liées"`
  - `subIssues: number[]` = numéros des issues du cluster
  - `symbols: string[]` = union des symboles du cluster

Les issues appartenant à un cluster ne sont plus listées individuellement — elles sont représentées par leur top-issue.

### D. Tri prioritaire dans le prompt

Ordre d'injection dans le prompt Claude :
1. Top-issues (avec sub-issues) — listées en premier
2. Issues isolées (sans cluster) — listées après

Cette position dans le prompt guide naturellement Claude à les traiter en premier dans la roadmap.

### E. Contrainte d'intégrité dans le prompt

Ajouter dans `buildAnalysisPrompt()` la règle :

> "Les issues marquées `[CLUSTER]` sont couplées techniquement. Elles DOIVENT appartenir à la même étape de la roadmap. Ne pas les séparer."

### F. Format de sortie enrichi

Ajouter un nouveau bloc dans le format Markdown de sortie :

```markdown
### Groupe N — Nom
Issues : #X, #Y
[CLUSTER: #X → #Y] ← indique les top-issues et leurs membres
Résumé : <1 phrase>
Dépend de : <Groupe X si applicable>
```

Le parsing côté client exploitera ce marqueur `[CLUSTER: ...]` pour l'affichage encadré.

---

## 4. Étapes de modification du code

### Étape 1 — Enrichissement symbolique des issues (`issue-analysis.ts`)

1. Ajouter champ `symbols?: string[]` dans `IssueInput` et `PreparedIssue`
2. Créer fonction `enrichIssueWithSymbols(issue: PreparedIssue, projectRoot: string): Promise<PreparedIssue>`
   - Appelle `searchMethods(query, projectRoot)` depuis `cartography.ts`
   - Retourne issue avec `symbols` rempli (top 5 clés)
3. Dans `prepareIssues()`, ajouter une passe d'enrichissement symbolique après le résumé (batch de 3 max)

### Étape 2 — Algorithme de clustering (`issue-analysis.ts`)

1. Créer type `SymbolCluster { id: string; issues: number[]; sharedSymbols: string[] }`
2. Créer fonction `computeSymbolClusters(issues: PreparedIssue[]): SymbolCluster[]`
   - Union-find sur les chevauchements de symboles
   - Ne retourne que les clusters de taille ≥ 2
3. Créer fonction `applyClusterHierarchy(issues: PreparedIssue[], clusters: SymbolCluster[]): PreparedIssue[]`
   - Pour les issues dans un cluster : ajouter `parentCluster: string` dans le champ metadata
   - Retourner les issues triées : d'abord celles avec cluster, ensuite les isolées

### Étape 3 — Mise à jour du prompt d'analyse (`issue-analysis.ts`)

1. Mettre à jour `buildAnalysisPrompt()` :
   - Ajouter contrainte `[CLUSTER]` dans CONTRAINTES
   - Injecter les clusters comme section dédiée avant ISSUES :
     ```
     CLUSTERS SYMBOLIQUES
     CLUSTER-1 : #12, #15, #23 — symboles partagés : auth.ts:login, auth.ts:validateToken
     CLUSTER-2 : #7, #31 — symboles partagés : db.ts:query
     ```
   - Marquer les issues membres d'un cluster avec `[CLUSTER-N]` dans la liste ISSUES
2. Mettre à jour `buildUpdatePrompt()` de la même façon

### Étape 4 — Mise à jour du format de sortie et parsing (`stores/agent.ts`)

1. Enrichir `PlanGroup` :
   ```typescript
   export type PlanGroup = {
       index: number;
       name: string;
       issues: number[];
       clusterMembers?: number[][];  // Sous-groupes à afficher ensemble
   };
   ```
2. Mettre à jour `parseGroups()` pour extraire les marqueurs `[CLUSTER: ...]`

### Étape 5 — Affichage encadré dans `IssueAnalysis.svelte`

1. Dans la section d'affichage des groupes (liste des issues par groupe) :
   - Détecter les `clusterMembers` dans le groupe
   - Afficher chaque cluster dans un `<div class="cluster-box">` avec :
     - Border colorée (utiliser la couleur de label existante ou une couleur dédiée par cluster)
     - Titre optionnel "Issues liées"
     - Les issues membres listées à l'intérieur
2. CSS : ajouter `.cluster-box` avec `border-left: 3px solid <couleur>; padding: 4px 8px; margin: 4px 0; border-radius: 4px`
3. Les issues hors cluster continuent d'être affichées normalement

### Étape 6 — Pipeline dans les routes API

1. `src/routes/api/issues/analyze/+server.ts` :
   - Après `prepareIssues()`, appeler `computeSymbolClusters()`
   - Appeler `applyClusterHierarchy()` avant de passer au prompt
   - Passer les clusters à `buildAnalysisPrompt()`
2. `src/routes/api/issues/analyze/update/+server.ts` :
   - Même enrichissement pour les nouvelles issues

---

## 5. Vérifications et nettoyage final

### Régressions à éviter

- [ ] Les issues sans symboles trouvés (cartographie vide) ne doivent pas être perdues
- [ ] Les sub-issues GitHub existantes (relation GitHub native) ne doivent pas conflicuer avec les clusters synthétiques
- [ ] `knownSubIssueNumbers` ne doit pas inclure les membres de clusters (ils restent des issues à part entière)
- [ ] Si `searchMethods()` échoue ou timeout, l'enrichissement symbolique est silencieusement ignoré (`symbols: []`)
- [ ] La roadmap existante sauvegardée reste lisible (le nouveau format avec `[CLUSTER:]` est optionnel)

### Tests manuels

1. Lancer une analyse avec des issues qui touchent clairement les mêmes fichiers → vérifier qu'un cluster est formé
2. Lancer une analyse avec des issues totalement indépendantes → vérifier qu'aucun cluster n'est formé
3. Vérifier que l'affichage des encadrés apparaît pour les clusters dans l'UI
4. Vérifier que la mise à jour incrémentale (bouton "Mettre à jour") conserve les clusters existants
5. Vérifier que le chat de raffinement ne casse pas les clusters

### Nettoyage

- Supprimer tout log de debug ajouté pendant le développement
- S'assurer que `computeSymbolClusters()` est bien exportée si elle doit être testée isolément
- Documenter le seuil de clustering (1 symbole partagé = cluster) dans un commentaire — ce seuil peut être affiné
