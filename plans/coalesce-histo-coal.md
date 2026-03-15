# Plan — Coalesce Histo et Coalescence

## 1. Analyse du problème

L'onglet **clusters** affiche actuellement deux sections séparées :

- **HISTORIQUE** : nœuds `HistoricalCoalNode` issus des co-modifications git (`histCoal[]`)
- **COALESCENCE** : nœuds `CoalNode` issus des co-occurrences dans les issues GitHub (`coal[]`)

Ces deux ensembles peuvent partager les mêmes symboles (ex : `ensureDir`, `getTasksDir`, `listTasks`, `migrateTaskStatus`).

**Objectif** : quand un nœud historique et un nœud de coalescence partagent un ensemble de symboles, les fusionner visuellement dans la liste COALESCENCE :

- Les symboles communs sont mis en **lavande** (couleur historique) dans le nœud de coalescence
- Le compteur de commits (`N×`) est ajouté au header du nœud
- Les issues référencées dans les commits (`histMatch.issues`) sont affichées sous les issues classiques :
  - `#id` **barré** (`<s>`) si l'issue est déjà dans `coal.issues` (déjà compté dans la coalescence sémantique)
  - `#id` normal sinon (issue supplémentaire détectée uniquement par l'historique)
- La section HISTORIQUE ne montre plus que les nœuds **sans correspondance** dans la coalescence

---

## 2. Localisation des usages

| Fichier | Ce qui change |
|---|---|
| `src/lib/server/services/git-history.ts` | Ajouter `issues: number[]` à `HistoricalCoalNode` ; enrichir `buildHistoricalCoal` |
| `src/routes/api/clusters/+server.ts` | Ajouter `histMatch?` à `CoalNode` ; calcul du matching histCoal ↔ coal |
| `src/lib/components/IssueChip.svelte` | Ajouter prop `strikethrough?: boolean` |
| `src/lib/components/PlanPanel.svelte` | Afficher `histMatch` dans COALESCENCE ; filtrer HISTORIQUE |

---

## 3. Stratégie de remplacement

### Enrichissement du type `HistoricalCoalNode`

`buildHistoricalCoal` reçoit les `CommitRecord[]`. Chaque commit a `issueRefs: number[]`.
Les `common` indices de commits (déjà calculés dans l'algorithme) donnent les commits co-modifiés.
→ Collecter les `issueRefs` de ces commits = issues associées à ce nœud historique.

### Algorithme de matching histCoal → coal

Pour chaque `CoalNode` :
1. Construire un `Set` des clés de ses symboles (`coal.symbols.map(s => s.key)`)
2. Chercher dans `historical.coal` le `HistoricalCoalNode` avec la plus grande intersection
3. Critère de match : intersection ≥ 2 symboles **ET** ≥ 50 % des symboles du nœud historique
4. Si match → annoter le `CoalNode` avec `histMatch: { symbols, count, issues }`

Un `HistoricalCoalNode` peut correspondre à plusieurs `CoalNode`s (one-to-many acceptable car les deux axes sont indépendants).

---

## 4. Étapes de modification du code

### Étape A — `src/lib/server/services/git-history.ts`

**A1.** Modifier le type `HistoricalCoalNode` :

```diff
 export type HistoricalCoalNode = {
     symbols: string[];
     count:   number;
     score:   number;
+    issues:  number[];
 };
```

**A2.** Dans `buildHistoricalCoal`, collecter les issues depuis les commits communs :

```diff
- coalByKey.set(key, { symbols: extSyms, count: common.length });
+ const issueSet = new Set<number>();
+ for (const idx of common) {
+     for (const ref of records[idx].issueRefs) issueSet.add(ref);
+ }
+ coalByKey.set(key, { symbols: extSyms, count: common.length, issues: [...issueSet].sort((a, b) => a - b) });
```

**A3.** Mettre à jour le `.map()` final pour inclure `issues` :

```diff
- .map(({ symbols, count }) => ({ symbols, count, score: symbols.length * count }))
+ .map(({ symbols, count, issues }) => ({ symbols, count, score: symbols.length * count, issues }))
```

---

### Étape B — `src/routes/api/clusters/+server.ts`

**B1.** Modifier le type `CoalNode` :

```diff
 export type CoalNode = {
     symbols: CoalSymbol[];
     issues:  number[];
     score:   number;
     count:   number;
+    histMatch?: { symbols: string[]; count: number; issues: number[] };
 };
```

**B2.** Après la construction de `coal[]` (ligne ~226) et avant le `return json(...)`, ajouter le calcul des matchs :

```ts
// ── 6. Annotation histMatch sur les nœuds de coalescence ─────────────────
if (historical) {
    for (const node of coal) {
        const coalKeys = new Set(node.symbols.map(s => s.key));
        let bestNode: HistoricalCoalNode | null = null;
        let bestRatio = 0;

        for (const hNode of historical.coal) {
            const inter = hNode.symbols.filter(s => coalKeys.has(s));
            if (inter.length < 2) continue;
            const ratio = inter.length / hNode.symbols.length;
            if (ratio > bestRatio) { bestNode = hNode; bestRatio = ratio; }
        }

        if (bestNode && bestRatio >= 0.5) {
            const inter = bestNode.symbols.filter(s => coalKeys.has(s));
            node.histMatch = { symbols: inter, count: bestNode.count, issues: bestNode.issues };
        }
    }
}
```

---

### Étape C — `src/lib/components/IssueChip.svelte`

**C1.** Ajouter la prop `strikethrough` et le style associé :

```diff
 export let number: number;
+export let strikethrough = false;
```

```diff
-<button class="chip" onclick={select}>#{number}</button>
+<button class="chip" class:chip--struck={strikethrough} onclick={select}>
+    {#if strikethrough}<s>#{number}</s>{:else}#{number}{/if}
+</button>
```

```diff
+.chip--struck {
+    opacity: 0.55;
+    color: #7a5a9a;
+    border-color: #3a2a5a;
+}
```

---

### Étape D — `src/lib/components/PlanPanel.svelte`

**D1.** Mettre à jour le type local `CoalNode` :

```diff
-type CoalNode = { symbols: CoalSymbol[]; issues: number[]; score: number; count: number };
+type CoalNode = { symbols: CoalSymbol[]; issues: number[]; score: number; count: number; histMatch?: { symbols: string[]; count: number; issues: number[] } };
```

**D2.** Calculer un `Set` des nœuds historiques matchés (pour filtrer la section HISTORIQUE) :

Ajouter après `loadClusters` un dérivé :
```ts
$: matchedHistSymbolSets = new Set(
    coal.filter(n => n.histMatch).map(n => n.histMatch!.symbols.sort().join(","))
);
```

**D3.** Dans le rendu de la section **COALESCENCE**, modifier le header pour ajouter le badge commits si `histMatch` :

```diff
 <span class="coal-score">{node.score}</span>
+{#if node.histMatch}
+    <span class="hist-score hist-score--inline">{node.histMatch.count}×</span>
+{/if}
```

**D4.** Dans `{#if open}`, modifier l'affichage des symboles pour colorer en lavande les symboles matchés :

```diff
 {#each node.symbols as sym}
     <div class="sym-line">
         <button
             class="sym-name"
+            class:sym-name--hist={node.histMatch?.symbols.includes(sym.key)}
             class:sym-active={$clusterFocusedSymbol?.name === sym.key}
             onclick={() => clusterFocusedSymbol.set({ name: sym.key, dir: sym.dir })}
         >{sym.key.split(".").at(-1)}</button>
         <span class="sym-dir-tag">{sym.dir}</span>
     </div>
 {/each}
```

**D5.** Après les `IssueChip` des issues classiques, ajouter les issues historiques :

```diff
 <div class="dir-issues">
     {#each node.issues as num}
         <IssueChip number={num} />
     {/each}
+    {#if node.histMatch}
+        {#each node.histMatch.issues as num}
+            <IssueChip number={num} strikethrough={node.issues.includes(num)} />
+        {/each}
+    {/if}
 </div>
```

> Note : les issues déjà dans `coal.issues` seront affichées en double (une fois normale, une fois barrée).
> Pour éviter la duplication, on peut filtrer : n'afficher en lavande que celles **absentes** de `coal.issues`, et marquer les présentes avec une petite icône historique sur le chip existant.
> **Décision à prendre** : duplication acceptable (plus simple) ou dédoublonnage (plus propre) ?

**D6.** Dans la section **HISTORIQUE**, filtrer pour n'afficher que les nœuds non matchés :

```diff
-{#each histCoal as node, i}
+{#each histCoal.filter(n => !matchedHistSymbolSets.has(n.symbols.slice().sort().join(","))) as node, i}
```

Si tous les nœuds historiques sont matchés, la section HISTORIQUE disparaît naturellement.

**D7.** Ajouter le style CSS `sym-name--hist` (lavande) :

```css
.sym-name--hist {
    color: #c090c0;
}
.sym-name--hist:hover {
    color: #e0b0e0;
}
.hist-score--inline {
    font-size: 0.6rem;
    color: #c090c0;
    margin-left: 0.3rem;
    opacity: 0.8;
}
```

---

## 5. Vérifications et nettoyage final

### Compatibilité de types
- [ ] `HistoricalCoalNode.issues` est utilisé dans `/api/git-history/+server.ts` — vérifier que la sérialisation JSON reste compatible (champ optionnel ou toujours présent)
- [ ] Le type exporté `HistoricalCoalNode` dans `git-history.ts` est importé dans `clusters/+server.ts` — un seul endroit à modifier
- [ ] Le `ClustersResponse` retourné inclut `histMatch?` dans chaque `CoalNode` — pas de changement de structure racine

### Cas limites
- [ ] `histMatch.issues` peut être `[]` si aucun commit ne référence d'issue → la div `.dir-issues` du histMatch sera vide, pas d'affichage parasite
- [ ] Si `histUpToDate === false`, le badge `histMatch` reste affiché mais avec le même avertissement "périmé" que la section HISTORIQUE (inchangé)
- [ ] Si `histCoal` est vide (`historical` absent), `matchedHistSymbolSets` sera un `Set` vide → comportement identique à l'actuel

### Régression
- [ ] L'onglet **étape** dérive `stepCoal` depuis `coal[]` — le champ `histMatch?` est optionnel, aucun impact
- [ ] `ArtifactViewer.svelte` utilise son propre type `ClusterCoalItem` sans `histMatch` → pas d'impact
- [ ] Le `GET /api/git-history` retourne `coal: HistoricalCoalNode[]` avec le nouveau champ `issues` → à vérifier que le front `PlanPanel.svelte` (onglet history → `histConcepts`) ne casse pas

### Nettoyage
- La section HISTORIQUE peut disparaître entièrement si tous les nœuds sont matchés → vérifier l'affichage conditionnel `{#if histCoal.length > 0}` → remplacer par une vérification sur les non-matchés
