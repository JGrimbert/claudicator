# Plan : Calibrage de la liste de skills proposés

**Objectif :** Réduire les 25 candidats actuels en supprimant les doublons
par sous-ensemble (filtre 1 — merge) puis les usages marginaux (filtre 2 — seuil).

---

## 1. Analyse du problème

### Pipeline actuel

```
/api/clusters  →  coal[] (score = symbols.length × issues.length)
                    ↓  filteredCoal = score >= 6
/api/skills/generate
                    ↓  invokeHaiku pour chaque nœud
proposals.json  (25 candidats)
```

### Cause du gonflement

**Problème A — Sous-ensembles non dédupliqués**

L'algorithme de coalescence dans `clusters/+server.ts` produit un nœud
pour chaque ensemble d'issues distinct. Si deux sous-ensembles d'issues
donnent des extensions différentes, les deux nœuds sont conservés.

Exemple utilisateur :
```
Nœud large  : buildQuery  getVueScriptOffset  saveSnapshot   (score 21, count 7)
Nœud petit  : buildQuery  getVueScriptOffset                 (score 14, count 7)
```
Les deux partagent les mêmes 7 issues. Le petit est un sous-ensemble strict
du grand → générer deux skills séparés est redondant.

**Problème B — Seuil de score trop bas**

`score >= 6` accepte des nœuds `3 symboles × 2 issues = 6`, soit des
compétences co-citées dans seulement 2 issues : trop fragile pour devenir
un skill pérenne.

---

## 2. Localisation des usages

| Fichier | Rôle | Ligne clé |
|---|---|---|
| `src/routes/api/clusters/+server.ts` | Génère `coal[]` triés par score | l.219–228 |
| `src/routes/api/skills/generate/+server.ts` | Applique le filtre `score >= 6` et appelle Haiku | l.38 |
| `src/lib/server/services/skill-proposals.ts` | Types + helpers (buildPrompt, saveProposals…) | — |
| `src/lib/components/ArchiView.svelte` | Affichage des regions/skills (ne consomme pas proposals) | — |
| `src/lib/components/PlanPanel.svelte` | Affichage éventuel des proposals | à vérifier |

> Les clusters `historical` ont déjà un garde `count >= 3` (l.39) ; il
> manque l'équivalent pour `coal`.

---

## 3. Stratégie de remplacement

### Filtre 1 — Déduplication par sous-ensemble (merge)

**Règle :** si les symboles du nœud A sont un sous-ensemble strict des
symboles du nœud B, **et** que les issues de A sont contenues dans celles
de B, alors A est redondant : le skill généré par B le couvre entièrement.

**Algorithme (appliqué après tri décroissant par score) :**

```
retained = []
for node in filteredCoal:                    // du plus grand score au plus petit
    dominated = false
    for keeper in retained:
        if symbols(node) ⊆ symbols(keeper)   // sous-ensemble strict
        AND issues(node) ⊆ issues(keeper):   // même couverture ou plus large
            dominated = true
            break
    if not dominated:
        retained.append(node)
filteredCoal = retained
```

Ce filtre est **O(n²)** sur les symboles, ce qui reste négligeable pour
quelques dizaines de nœuds.

### Filtre 2 — Seuil d'usage minimal

**Règle :** un skill n'est retenu que si son cluster apparaît dans
**au moins 3 issues** (`count >= 3`).

Changement dans `generate/+server.ts` :
```
// avant
const filteredCoal = coal.filter(n => n.score >= 6);

// après
const filteredCoal = coal.filter(n => n.score >= 6 && n.count >= 3);
```

L'ordre d'application des deux filtres :
```
coal[]
  │  score >= 6 AND count >= 3     (filtre 2 : seuil)
  ↓
  │  déduplication sous-ensemble   (filtre 1 : merge)
  ↓
filteredCoal[]  → génération Haiku
```

---

## 4. Étapes de modification du code

### Étape 1 — Ajouter le helper `deduplicateSubsets` dans `skill-proposals.ts`

```typescript
// Filtre les nœuds dominés par sous-ensemble de symboles et d'issues.
export function deduplicateSubsets(nodes: CoalNode[]): CoalNode[] {
    // Les nodes sont supposés triés score desc (déjà le cas depuis /api/clusters)
    const retained: CoalNode[] = [];
    for (const node of nodes) {
        const symSet  = new Set(node.symbols.map(s => s.key));
        const issSet  = new Set(node.issues);
        const dominated = retained.some(keeper => {
            const kSym = new Set(keeper.symbols.map(s => s.key));
            const kIss = new Set(keeper.issues);
            return [...symSet].every(s => kSym.has(s))    // symboles ⊆ keeper
                && [...issSet].every(i => kIss.has(i));   // issues  ⊆ keeper
        });
        if (!dominated) retained.push(node);
    }
    return retained;
}
```

Le type `CoalNode` est importé depuis `routes/api/clusters/+server.ts` ;
vérifier qu'il est exportable ou copier la définition locale minimale.

### Étape 2 — Modifier `generate/+server.ts`

```diff
-    const filteredCoal = coal.filter(n => n.score >= 6);
+    const filteredCoal = deduplicateSubsets(
+        coal.filter(n => n.score >= 6 && n.count >= 3)
+    );
```

Ajouter l'import :
```diff
 import {
     loadProposals,
     saveProposals,
     slugify,
     buildPrompt,
     parseHaikuResponse,
     invokeHaiku,
+    deduplicateSubsets,
 } from "$lib/server/services/skill-proposals";
```

### Étape 3 — (optionnel) Exposer les métriques dans la réponse

Ajouter dans le JSON retourné :
```diff
-    return json({ proposals, generated: proposals.length });
+    return json({
+        proposals,
+        generated:  proposals.length,
+        dropped:    coal.length - filteredCoal.length,
+    });
```

Cela permet de confirmer visuellement l'effet des filtres sans relancer
la génération.

---

## 5. Vérifications et nettoyage final

### Régression — algorithme de coalescence

- Re-générer les proposals après modification.
- Vérifier que le nœud `buildQuery getVueScriptOffset saveSnapshot (7*)` est
  conservé et que `buildQuery getVueScriptOffset` seul est absorbé.
- Vérifier que des nœuds légitimement différents (issues distinctes) ne
  sont **pas** supprimés.

### Régression — filtre count >= 3

- Lister les nœuds éliminés par ce seul filtre et vérifier qu'ils
  correspondent bien à des clusters marginaux (2 issues seulement).
- Si certains clusters à 2 issues semblent importants, envisager un seuil
  alternatif (`score >= 9` plutôt que `count >= 3`).

### Checklist UI

- [ ] `PlanPanel.svelte` : vérifier que l'affichage des proposals fonctionne
  avec une liste réduite (pas de rendu conditionnel cassé).
- [ ] Confirmer que `ArchiView.svelte` n'est pas impacté (il consomme
  `/api/skills` → `SKILL_REGISTRY`, indépendant des proposals).

### Types

- Vérifier que `CoalNode` (importé de `clusters/+server.ts`) est
  accessible dans `skill-proposals.ts` sans dépendance cyclique.
  Si besoin : extraire le type dans un fichier partagé (ex. `types/clusters.ts`).

---

## Résumé des fichiers modifiés

| Fichier | Nature de la modification |
|---|---|
| `src/lib/server/services/skill-proposals.ts` | Ajout de `deduplicateSubsets()` |
| `src/routes/api/skills/generate/+server.ts` | Filtre `count >= 3` + appel `deduplicateSubsets` |
