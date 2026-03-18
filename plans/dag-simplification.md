# Plan — Simplification onglet DAG

## 1. Analyse du problème

L'onglet DAG est composé de deux couches visuelles distinctes qui se superposent sans cohérence :

**Couche Svelte (RoadmapViz.svelte)** — toolbar parent :
- Label `◉ roadmap` redondant avec le label de l'onglet "dag" dans JgrTabs
- Bouton `↺` isolé en haut à droite, stylé différemment du reste de l'UI

**Couche iframe (ai/roadmap.html généré par roadmap-visualizer.cjs)** — HTML autonome :
- Header `◉ claudicator` + date : doublon avec la toolbar parent
- Mode-bar `◉ tasks | ◦ steps | ◦ plan` : boutons avec border, symboles décoratifs inutiles
- Stats-bar `nodes | edges | levels | steps` : pills avec border + background
- Légende des cercles de couleurs (Core, Entry, Service…) : verbeuse, peu utile
- Sidebar droite : colonne custom ad-hoc, totalement hors chartre jgr-ui

Le problème principal est la **double responsabilité** : RoadmapViz.svelte essaie de wrapper un HTML autonome dans un composant Svelte, créant une incohérence visuelle et architecturale. Le HTML généré a son propre design system (lolve) qui tranche avec celui de claudicator (jgr-ui).

---

## 2. Localisation des usages

| Élément à modifier | Fichier | Ligne(s) |
|---|---|---|
| Toolbar `◉ roadmap` + `↺` | `src/lib/components/RoadmapViz.svelte` | L43–62 |
| Style toolbar | `src/lib/components/RoadmapViz.svelte` | L100–148 |
| Header `◉ ${project}` + date | `C:/lolve-cartography/lib/roadmap-visualizer.cjs` | L636–641 |
| Mode-bar `◉ tasks ◦ steps ◦ plan` | `C:/lolve-cartography/lib/roadmap-visualizer.cjs` | L614–624 |
| CSS mode-btn (borders) | `C:/lolve-cartography/lib/roadmap-visualizer.cjs` | L493–500 |
| Stats-bar pills | `C:/lolve-cartography/lib/roadmap-visualizer.cjs` | L643–649 |
| CSS stat-pill (border+bg) | `C:/lolve-cartography/lib/roadmap-visualizer.cjs` | L376–386 |
| Légende `#legend` | `C:/lolve-cartography/lib/roadmap-visualizer.cjs` | L651–659 |
| CSS `#legend` + `.legend-item` | `C:/lolve-cartography/lib/roadmap-visualizer.cjs` | L387–400 |
| Sidebar `#sidebar` (droite) | `C:/lolve-cartography/lib/roadmap-visualizer.cjs` | L662–666 |
| CSS `#sidebar` | `C:/lolve-cartography/lib/roadmap-visualizer.cjs` | L403–419 |

---

## 3. Stratégie de remplacement

### Phase 1 — Simplifications immédiates (dans ce plan)

Toucher uniquement la couche visuelle sans changer l'architecture iframe.

Principe directeur : **le moins possible d'éléments dans l'iframe, le plus de sobriété**.

**Dans RoadmapViz.svelte** :
- Supprimer entièrement la `.toolbar` (label `◉ roadmap` + bouton `↺`)
- Repositionner `↺` en **overlay absolu** sur `.frame-wrap`, top-left, aligné avec le header de l'iframe
- Le bouton ↺ reste dans le DOM Svelte (pas dans l'iframe) → pas besoin de postMessage

**Dans roadmap-visualizer.cjs** :
- `#header` : remplacer `◉ ${project}` par la date seule (le ◉ disparaît, project est dans le titre de l'onglet)
- Mode-bar : supprimer les symboles `◉`/`◦`, supprimer les borders individuelles, ajouter un séparateur `|` entre items (via `border-right` sur le parent)
- Stats-bar : supprimer `.stat-pill` border + background, texte seul avec opacité faible
- `#legend` : supprimer entièrement le bloc HTML et le CSS associé

### Phase 2 — Refactor sidebar vers jgr-ui (chantier séparé)

Le `#sidebar` de l'iframe doit devenir une colonne jgr-ui dans claudicator.

Cela implique :
1. roadmap-visualizer.cjs expose les données (tasks, steps, plan) séparément du HTML
2. Un endpoint GET `/api/roadmap-viz/data` retourne le JSON de la roadmap
3. RoadmapViz.svelte monte un `JgrResizablePanel` avec `JgrTabs` (tasks | steps | plan)
4. Le sidebar dans l'iframe est supprimé (iframe = SVG seul)

**Ce chantier est hors scope de ce plan — traiter séparément.**

---

## 4. Étapes de modification du code

### Étape 1 — RoadmapViz.svelte : supprimer toolbar, ↺ en overlay

**Objectif** : enlever `.toolbar`, repositionner `↺` dans `.frame-wrap` en absolu top-left.

```diff
- <!-- ── Toolbar ── -->
- <div class="toolbar">
-     <span class="label">◉ roadmap</span>
-     <div class="toolbar-right">
-         {#if status === "error"}
-             <span class="err">{errorMsg}</span>
-         {/if}
-         <button
-             class="btn-refresh"
-             onclick={generate}
-             disabled={status === "generating"}
-             title="(Re)générer la roadmap"
-         >
-             {#if status === "generating"}
-                 <span class="spin">···</span>
-             {:else}
-                 ↺
-             {/if}
-         </button>
-     </div>
- </div>

  <!-- ── Contenu ── -->
  <div class="frame-wrap">
+     <!-- Bouton refresh en overlay (remplace le ◉ du header iframe) -->
+     <button
+         class="btn-refresh"
+         onclick={generate}
+         disabled={status === "generating"}
+         title="(Re)générer la roadmap"
+     >
+         {#if status === "generating"}
+             <span class="spin">···</span>
+         {:else}
+             ↺
+         {/if}
+     </button>
+     {#if status === "error"}
+         <span class="err-overlay">{errorMsg}</span>
+     {/if}
```

CSS à modifier dans `<style>` :
- Supprimer `.toolbar`, `.label`, `.toolbar-right`, `.err` (remplacés)
- Modifier `.btn-refresh` → `position: absolute; top: 12px; left: 12px; z-index: 10; border: none; color: #9b8db2; ...`
- Ajouter `.err-overlay` → positionnement absolu top-left en dessous du bouton

### Étape 2 — roadmap-visualizer.cjs : simplifier #header

**Objectif** : le `◉ ${project}` disparaît, seule la date reste (sobre, pointer-events none).

```diff
- <div id="header">
-   <h1>◉ ${escHtml(project || 'roadmap')}</h1>
-   <div class="meta">
-     ${escHtml(generated?.slice(0, 16).replace('T', ' ') || '')}
-     ${issueScope ? ` · scope: ${escHtml(issueScope)}` : ''}
-   </div>
- </div>

+ <div id="header">
+   <div class="meta">
+     ${escHtml(generated?.slice(0, 16).replace('T', ' ') || '')}
+     ${issueScope ? ` · ${escHtml(issueScope)}` : ''}
+   </div>
+ </div>
```

CSS : supprimer `#header h1` et simplifier `.meta` (opacité plus faible, décalage pour laisser place au ↺ overlay : `padding-left: 28px`).

### Étape 3 — roadmap-visualizer.cjs : simplifier mode-bar

**Objectif** : `tasks | steps | plan` sans symboles, sans border individuelle, séparateur vertical.

```diff
  <div id="mode-bar">
-   <button class="mode-btn active" id="btn-tasks" onclick="setMode('tasks')">◉ tasks</button>
-   <button class="mode-btn" id="btn-steps" onclick="setMode('steps')">◦ steps</button>
-   <button class="mode-btn" id="btn-plan" onclick="setMode('plan')">◦ plan</button>
+   <button class="mode-btn active" id="btn-tasks" onclick="setMode('tasks')">tasks</button>
+   <button class="mode-btn" id="btn-steps" onclick="setMode('steps')">steps</button>
+   <button class="mode-btn" id="btn-plan" onclick="setMode('plan')">plan</button>
```

CSS `.mode-btn` :
```css
/* AVANT */
.mode-btn {
  background: none; border: 1px solid rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.4); font-size: 9px; font-family: monospace;
  padding: 3px 10px; border-radius: 3px; cursor: pointer;
  letter-spacing: 0.06em; transition: all 0.15s;
}
.mode-btn.active { border-color: ...; color: ...; }

/* APRÈS */
.mode-btn {
  background: none; border: none;
  border-right: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.3); font-size: 9px; font-family: monospace;
  padding: 2px 10px; cursor: pointer;
  letter-spacing: 0.06em; transition: color 0.15s;
}
.mode-btn:last-of-type { border-right: none; }
.mode-btn.active { color: ${PALETTE.purpleLight}; }
.mode-btn:hover:not(.active) { color: rgba(255,255,255,0.6); }
```

Note : la mise à jour dynamique du texte des boutons (qui remet `◉`/`◦` en JS) est à supprimer dans le script inline. Chercher `btn-tasks.textContent` dans le JS généré et supprimer les assignations de symbole.

### Étape 4 — roadmap-visualizer.cjs : simplifier stats-bar

**Objectif** : pas de border/background, texte discret seulement.

CSS `.stat-pill` :
```css
/* AVANT */
.stat-pill {
  font-size: 9px;
  color: var(--stroke-purple-light-middle);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px;
  padding: 3px 10px;
}

/* APRÈS */
.stat-pill {
  font-size: 9px;
  color: rgba(255,255,255,0.25);
  font-family: monospace;
}
```

### Étape 5 — roadmap-visualizer.cjs : supprimer #legend

**Objectif** : retirer entièrement le bloc HTML et les styles CSS.

HTML à supprimer :
```html
<!-- Legend -->
<div id="legend">
  ${Object.entries(SKILL_COLOR).map(...).join('')}
</div>
```

CSS à supprimer : `#legend`, `.legend-item`, `.legend-dot`.

### Étape 6 — roadmap-visualizer.cjs : JS inline — supprimer assignations de symboles

Chercher dans le script inline généré les lignes qui reassignent le texte des boutons avec `◉`/`◦` lors du changement de mode (fonction `setMode`). Supprimer ces assignations puisque les boutons n'ont plus de symboles.

Exemple de code à supprimer dans `setMode()` :
```js
// à supprimer
document.getElementById('btn-tasks').textContent = mode === 'tasks' ? '◉ tasks' : '◦ tasks';
document.getElementById('btn-steps').textContent = mode === 'steps' ? '◉ steps' : '◦ steps';
document.getElementById('btn-plan').textContent  = mode === 'plan'  ? '◉ plan'  : '◦ plan';
```

Remplacer par des classes CSS actives seulement (le CSS `.mode-btn.active` gère la couleur).

---

## 5. Vérifications et nettoyage final

### Vérifications fonctionnelles

- [ ] Le bouton ↺ overlay reste cliquable au-dessus de l'iframe (vérifier `pointer-events`)
- [ ] La génération POST fonctionne toujours après suppression de la toolbar
- [ ] Le statut "generating" (spinner `···`) s'affiche correctement en overlay
- [ ] L'état "error" affiche le message dans `.err-overlay`
- [ ] Les modes tasks/steps/plan changent correctement (JS `setMode` toujours fonctionnel)
- [ ] Pan/zoom sur le SVG non bloqué par l'overlay

### Vérifications visuelles

- [ ] Le ↺ overlay est aligné avec la date dans le header iframe (cohérence optique)
- [ ] La mode-bar est lisible sans borders (contraste suffisant)
- [ ] Les stats-bar sont présentes mais discrètes
- [ ] Aucun vestige de la légende en bas à droite

### Régénération requise

Après modification de `roadmap-visualizer.cjs`, le fichier `ai/roadmap.html` est statique — il faut **régénérer** la roadmap via le bouton ↺ pour que les changements de template soient visibles. Le HTML existant en cache ne sera pas mis à jour automatiquement.

### Nettoyage CSS dans RoadmapViz.svelte

Supprimer les classes CSS devenues inutiles après la suppression de la toolbar :
- `.toolbar`, `.label`, `.toolbar-right`, `.err`
- Conserver et adapter : `.btn-refresh`, `.spin`, `.frame-wrap`, `.viz-frame`, `.placeholder`

---

## Note architecturale — Phase 2 : refactor vers jgr-ui

Le `#sidebar` de l'iframe (colonne droite avec les step-cards) est une duplication de ce que jgr-ui sait faire. Le plan de migration serait :

1. **roadmap-visualizer.cjs** génère le SVG seul (sans sidebar) et expose un JSON `/api/roadmap-viz/data`
2. **RoadmapViz.svelte** monte un `JgrResizablePanel` à droite avec :
   - `JgrTabs` : onglets `tasks | steps | plan` (composants jgr-ui, pas des boutons ad-hoc)
   - Listes Svelte avec les step-cards (harmonisées avec le design system)
3. La communication iframe → Svelte se fait via `postMessage` pour les sélections
4. Les couleurs de l'iframe passent en dark+50% pour s'harmoniser avec l'UI claudicator

Ce chantier est à traiter dans un plan dédié une fois les simplifications Phase 1 validées.
