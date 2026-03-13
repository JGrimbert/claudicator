# Plan — Styles SVG Mermaid (Roadmap)

**Branche** : `issue-16-interface-trop-dark`
**Fichier cible** : `src/lib/components/IssueAnalysis.svelte`

---

## 1. Analyse du problème

Le diagramme Mermaid `graph TD` de la roadmap présente deux problèmes visuels :

### 1.1 Flèches
- Les arêtes (`edgePath path`) sont déjà en pointillés (`stroke-dasharray: 4 3`) ✓
- Les pointes (`arrowheadPath`) sont **pleines** (`fill: var(--border-strong)`) ✗
- Les pointes ont la taille par défaut de Mermaid (trop grandes) ✗

### 1.2 Espacement vertical dans les noeuds
- Chaque noeud contient : **nom du groupe** (ex. "Infrastructure") + **chips d'issues** (#12, #15…)
- Le `line-height: 1.6` est insuffisant entre le nom et les chips
- Le `padH = 16` ne laisse pas assez de marge interne

---

## 2. Localisation des usages

Tout est dans **`src/lib/components/IssueAnalysis.svelte`** :

| Ligne | Élément | Rôle |
|-------|---------|------|
| 786–796 | `.edgePath path`, `.arrowheadPath` | CSS flèches + pointes |
| 755–766 | `.nodeLabel` | CSS label des noeuds |
| 768–784 | `.mermaid-issue-chip` | CSS chips d'issues |
| 196 | `const padH = 16` | Padding vertical JS des noeuds |
| 138–237 | `attachMermaidClicks()` | Post-traitement JS du SVG |

---

## 3. Stratégie

### 3.1 Pointes non pleines + plus petites

**Approche CSS** (prioritaire) :
- Remplacer `fill: var(--border-strong)` par `fill: none` + `stroke: var(--border-strong)`
- Ajouter `stroke-width: 1px`

**Approche JS complémentaire** dans `attachMermaidClicks()` :
- Sélectionner tous les éléments `<marker>` du SVG rendu
- Réduire `markerWidth` et `markerHeight` d'environ 40% (ex. `* 0.6`)

Ces deux approches sont combinées : CSS pour le style visuel, JS pour la taille.

### 3.2 Espacement vertical

**Approche CSS** :
- Ajouter `margin-top: 0.5rem` sur `.mermaid-issue-chip` pour créer de l'espace entre le nom et les chips

**Approche JS** :
- Augmenter `padH` de `16` à `28` pour que les noeuds soient recalculés avec plus de hauteur interne

---

## 4. Étapes de modification du code

### Étape A — CSS : pointes non pleines

**Remplacer** le bloc `.arrowheadPath` (lignes 792–796) :

```css
/* Avant */
.mermaid-container :global(.arrowheadPath) {
    fill: var(--border-strong) !important;
    stroke: none !important;
    opacity: 0.5 !important;
}

/* Après */
.mermaid-container :global(.arrowheadPath) {
    fill: none !important;
    stroke: var(--border-strong) !important;
    stroke-width: 1px !important;
    opacity: 0.6 !important;
}
```

### Étape B — JS : réduire la taille des markers

**Dans `attachMermaidClicks()`**, après la ligne `svgEl.removeAttribute("height")` (ou dans le bloc de manipulation SVG), ajouter avant le `requestAnimationFrame` :

```ts
// Réduire les markers d'arrowheads
const svgElem = mermaidDiv.querySelector("svg");
if (svgElem) {
    for (const marker of Array.from(svgElem.querySelectorAll("marker"))) {
        const mw = parseFloat(marker.getAttribute("markerWidth") ?? "10");
        const mh = parseFloat(marker.getAttribute("markerHeight") ?? "10");
        marker.setAttribute("markerWidth",  String(Math.round(mw * 0.6)));
        marker.setAttribute("markerHeight", String(Math.round(mh * 0.6)));
    }
}
```

Emplacement exact : dans `attachMermaidClicks()`, après le bloc "Remonter les edges" (ligne ~153) et avant le bloc chips.

### Étape C — CSS : espacement vertical (chips)

**Dans le bloc `.mermaid-issue-chip`** (ligne ~768), ajouter `margin-top` :

```css
.mermaid-container :global(.mermaid-issue-chip) {
    /* ... propriétés existantes ... */
    margin-top: 0.5rem !important;   /* AJOUT */
}
```

### Étape D — JS : augmenter padH

**Ligne 196**, remplacer :

```ts
const padH = 16, padW = 24;
```

par :

```ts
const padH = 28, padW = 24;
```

---

## 5. Vérifications et nettoyage final

### Vérifications visuelles
- [ ] Les pointes des flèches sont bien en trait ouvert (non rempli), visibles sur fond sombre
- [ ] Les pointes sont notablement plus petites que par défaut Mermaid
- [ ] Les arêtes restent en pointillés (`stroke-dasharray: 4 3`)
- [ ] L'espacement entre le nom du groupe et les chips est visuellement clair (~0.5rem)
- [ ] Les noeuds ne débordent pas du SVG après augmentation de `padH`
- [ ] Les noeuds sans chips d'issues (`padH` augmenté mais sans chips) ne sont pas trop hauts

### Régressions potentielles
- Le recalcul de hauteur des noeuds (Pass 1 + Pass 2 dans `requestAnimationFrame`) tient compte du nouveau `padH` — pas de régression attendue
- Les `markerWidth`/`markerHeight` à `0` sont impossibles (multiplication par 0.6, valeurs de départ ≥ 4) — pas de régression
- L'opacité des pointes passe de 0.5 à 0.6 pour compenser la perte de remplissage — ajuster si trop visible ou pas assez
