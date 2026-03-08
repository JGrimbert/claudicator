Voici le plan détaillé :
---
## Plan — Corrections UI (inconsistances)
### 1. Analyse du problème
Huit anomalies ont été identifiées dans cinq fichiers :
| # | Section | Problème |
|---|---------|----------|
| A1 | Agent (`agent-wrapper`) | Deux `toggle-btn` (▲/▼) dans le `todos-header` deviennent inutiles |
| A2 | Agent (occurrences) | Le count dans `result-group-header` duplique le `tab-count` de l'onglet |
| P1 | Projet (`cmd-bar`) | Trop de boutons ; seul `Full --force` est utile → renommer `"Init"` |
| P2 | Projet (fichiers .md) | Les `file-card` (160 px) prennent trop de place → liste horizontale compacte |
| P3 | Projet (bouton Map) | Le bouton "Map" ne laisse pas percevoir qu'il est un retour → renommer `"Codebase"` |
| AR | Artefacts (header) | Le `panel-header` d'`ArtifactViewer` a un padding différent des autres → dysharmonie |
| I1 | Issues (redim.) | Pas de handle vertical entre Artefact et Issues dans `<aside>` |
| I2 | Issues (bouton +) | Le `.new-btn` (18 × 18 px) est visuellement incohérent avec les autres boutons `+` |
---
### 2. Localisation des usages
**`src/lib/components/AgentConsole.svelte`** (problèmes A1, A2, P1, P2, P3)
- L. 96–98 : variables `inputOpen`, `listOpen` pilotées par les toggle-btn
- L. 85–92 : tableau `CMD_BUTTONS` (6 entrées + bouton Map séparé)
- L. 297–303 : bouton `Map` hardcodé avec `showDiagram`
- L. 314–332 : bloc `.cards-row` + `.file-card` (height 160 px)
- L. 359–366 : `todos-header` → contient `.toggle-btn toggle-up` et `.toggle-btn toggle-down`
- L. 378, 401, 419 : `result-group-header` affichent `"Occurrences — N"`, `"Méthodes — N"`, `"Méthodes pertinentes — N"`
**`src/lib/components/ArtifactViewer.svelte`** (problème AR)
- L. 166–175 : `.panel-header` → `padding: 0.75rem 1rem`
- Référence : `IssueList.svelte` L. 153 → `padding: 0.4rem 0.75rem 0.4rem 1rem` et `TaskList.svelte` L. 497 → `padding: 0.6rem 1rem`
**`src/lib/components/IssueList.svelte`** (problème I2)
- L. 89–91 : bouton `.new-btn` avec `width: 18px; height: 18px`
- Référence pour le style cible : `ArtifactViewer.svelte` → `.plan-btn` (`border: 1px solid #222; color: #555; font-size: 0.62rem; padding: 0.15rem 0.5rem`)
**`src/routes/+page.svelte`** (problème I1)
- L. 353–356 : `<aside>` contient `<ArtifactViewer />` puis `<IssueList />` sans handle entre les deux
- L. 298–312 : logique existante `loadWidths` / `saveWidths` / `startDrag` / `LIMITS` réutilisable
---
### 3. Stratégie de remplacement
#### A1 — Supprimer les toggle-btn
Les variables `inputOpen` / `listOpen` ne servent plus. Il faut :
- Supprimer les deux `<button class="toggle-btn">` du template
- Supprimer les blocs conditionnels `{#if inputOpen}` et `{#if listOpen}` (garder le contenu toujours visible)
- Supprimer les variables `inputOpen`, `listOpen` dans le script
- Supprimer les styles `.toggle-btn`, `.toggle-up`, `.toggle-down`
#### A2 — Retirer le count des group-headers
Remplacer `"Occurrences — {grep.length}"` → `"Occurrences"`, idem pour `"Méthodes"` et `"Méthodes pertinentes"`.
#### P1 — Simplifier CMD_BUTTONS → un seul bouton "Init"
```ts
// avant
const CMD_BUTTONS = [
    { id: "full",       label: "Full" },
    { id: "full:force", label: "Full --force" },
    { id: "diagram",    label: "Diagram" },
    { id: "index",      label: "Index" },
    { id: "enrich",     label: "Enrich" },
    { id: "scan",       label: "Scan" },
];
// après
const CMD_BUTTONS = [
    { id: "full:force", label: "Init" },
];
```
Le bouton "Codebase" (ex-Map) reste séparé à droite via `margin-left: auto`.
#### P2 — Remplacer les file-card par une liste horizontale compacte
La section documentation devient une ligne de badges-boutons :
```html
<div class="doc-section">
    <span class="doc-label">Documentation</span>
    <div class="doc-files">
        {#each files as file}
            <button class="doc-file-btn" onclick={() => expandedFile = file}
                disabled={file.loading || !!file.error}>
                {file.name}
            </button>
        {/each}
    </div>
</div>
```
La vue expansée (`expandedFile`) occupe déjà tout le panel via la branche `{#if expandedFile}` existante — aucune logique à changer.
Supprimer `.cards-row`, `.file-card`, `.card-name`, `.card-preview`, `.card-err`.
#### P3 — Renommer "Map" → "Codebase"
Dans le bouton hardcodé (L. 302), remplacer `Map` par `Codebase`.
#### AR — Harmoniser la hauteur du panel-header d'ArtifactViewer
Cible : `padding: 0.6rem 1rem` (aligné sur TaskList). Modifier dans `ArtifactViewer.svelte` le style `.panel-header`.
#### I1 — Handle vertical Artefact / Issues
Ajouter dans `+page.svelte` :
- Une variable d'état `asideTopH` (hauteur de ArtifactViewer, défaut 60 %)
- Un handle horizontal (`<div class="vhandle">`) entre `<ArtifactViewer />` et `<IssueList />`
- La logique drag similaire à celle des handles latéraux (mousedown/mousemove/mouseup)
- Persistance dans `localStorage` (clé : `claudicator:aside-split`)
- Styles : `height: 6px; cursor: row-resize; border-top/bottom: 1px solid #1e1e1e`
- `ArtifactViewer` reçoit sa hauteur via `style="height: {asideTopH}%"` ; `IssueList` prend le reste (`flex: 1`)
#### I2 — Harmoniser le bouton + de Issues
Remplacer le style `.new-btn` (carré 18×18 px) par un style cohérent avec les boutons plan-btn/action existants :
```css
.new-btn {
    background: none;
    border: 1px solid #222;
    color: #555;
    font-size: 0.62rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: color 0.15s, border-color 0.15s;
}
.new-btn:hover { color: #9181f9; border-color: #9181f9; }
```
---
### 4. Étapes de modification du code
**Étape 1 — `AgentConsole.svelte` : toggle-btn (A1)**
- Supprimer `let inputOpen = true;` et `let listOpen = true;` (L. 97–98)
- Supprimer `{#if inputOpen}…{/if}` (garder le contenu de l'input)
- Supprimer les deux `<button class="toggle-btn">` dans `todos-header`
- Supprimer `{#if listOpen}…{/if}` (garder le contenu)
- Supprimer styles `.toggle-btn`, `.toggle-up`, `.toggle-down`
**Étape 2 — `AgentConsole.svelte` : count group-header (A2)**
- L. 378 : `"Occurrences — {grep.length}"` → `"Occurrences"`
- L. 401 : `"Méthodes — {methods.length}"` → `"Méthodes"`
- L. 419 : `"Méthodes pertinentes — {sem.length}"` → `"Méthodes pertinentes"`
**Étape 3 — `AgentConsole.svelte` : CMD_BUTTONS + bouton Map (P1 + P3)**
- Remplacer le tableau `CMD_BUTTONS` par un seul bouton `{ id: "full:force", label: "Init" }`
- Renommer le bouton `Map` hardcodé en `Codebase`
**Étape 4 — `AgentConsole.svelte` : section documentation (P2)**
- Remplacer `.cards-row` + `.file-card` par `.doc-section` + `.doc-files` + `.doc-file-btn`
- Supprimer styles obsolètes `.cards-row`, `.file-card`, `.card-name`, `.card-preview`, `.card-err`
- Ajouter styles `.doc-section`, `.doc-files`, `.doc-file-btn`
**Étape 5 — `ArtifactViewer.svelte` : hauteur panel-header (AR)**
- Style `.panel-header` : modifier `padding: 0.75rem 1rem` → `padding: 0.6rem 1rem`
**Étape 6 — `+page.svelte` : handle vertical (I1)**
- Ajouter variable `asideTopPct` (défaut : 60) et logique de drag vertical
- Modifier `<aside>` : passer `style="height: {asideTopPct}%"` à `<ArtifactViewer>` et laisser `<IssueList>` avec `flex: 1`
- Insérer `<div class="vhandle">` entre les deux composants
- Ajouter `startDragV` / style `.vhandle` / persistance localStorage
**Étape 7 — `IssueList.svelte` : bouton + (I2)**
- Remplacer le style `.new-btn` par le style harmonisé (voir §3)
---
### 5. Vérifications et nettoyage final
- [ ] **A1** : vérifier que la barre de recherche est toujours visible, et que la liste d'occurrences s'affiche sans condition
- [ ] **A1** : vérifier qu'aucune référence à `inputOpen` / `listOpen` ne subsiste
- [ ] **A2** : vérifier que les onglets affichent bien le count (il reste dans `tab-count`), et que les group-headers ne l'affichent plus
- [ ] **P1** : vérifier que le bouton "Init" lance bien la commande `full:force` (inchangé dans `runCmd`)
- [ ] **P2** : vérifier que le clic sur un `.md` ouvre bien la vue expansée (logique `expandedFile` inchangée)
- [ ] **P2** : vérifier que la section documentation reste visible même quand `showDiagram = true` (ou ajuster si nécessaire)
- [ ] **P3** : vérifier que le bouton "Codebase" toggle `showDiagram` (toggle existant, seul le label change)
- [ ] **AR** : vérifier que les trois panel-headers (Artefact, Issues, Tasks) ont la même hauteur visuelle
- [ ] **I1** : tester le drag du handle horizontal — vérifier min/max raisonnables (ex : 20 % / 80 %)
- [ ] **I1** : vérifier que la hauteur est bien restaurée au rechargement depuis `localStorage`
- [ ] **I2** : vérifier visuellement que le bouton `+` d'Issues est cohérent avec ceux de la même interface