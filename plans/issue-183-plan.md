Maintenant je lis les fichiers clés pour avoir le contenu précis avant de rédiger le plan.
Laisse-moi lire le TopBar et l'IssueAnalysis pour avoir le contexte complet.
Maintenant je cherche le HTML de la roadmap (iframe) et les composants jgr-ui disponibles.
J'ai maintenant tous les éléments nécessaires. Je rédige le plan.
Plan écrit dans `plans/dag-simplification.md`. Voici le résumé :

---

## Plan — Simplification onglet DAG

### 1. Analyse du problème

Deux couches visuelles superposées sans cohérence :
- **RoadmapViz.svelte** : toolbar avec `◉ roadmap` (redondant avec l'onglet "dag") + bouton `↺`
- **iframe roadmap.html** généré par `roadmap-visualizer.cjs` : son propre header `◉ claudicator`, mode-bar avec borders et symboles, stats pills avec background, légende couleurs, sidebar ad-hoc

Le design system de l'iframe (lolve) tranche avec jgr-ui.

---

### 2. Localisation des usages

| Élément | Fichier |
|---|---|
| Toolbar `◉ roadmap` + `↺` | `RoadmapViz.svelte` L43–62 |
| Header `◉ ${project}` | `roadmap-visualizer.cjs` L636–641 |
| Mode-bar symboles + borders | `roadmap-visualizer.cjs` L614–624, L493–500 |
| Stats-bar pills (border+bg) | `roadmap-visualizer.cjs` L643–649, L376–386 |
| Légende `#legend` | `roadmap-visualizer.cjs` L651–659 |
| Sidebar droite custom | `roadmap-visualizer.cjs` L662–666 |

---

### 3. Stratégie

**Phase 1 (ce plan)** — simplifications visuelles pures :
- RoadmapViz.svelte : supprimer la `.toolbar`, repositionner `↺` en **overlay absolu** top-left sur l'iframe (aligné avec le header)
- roadmap-visualizer.cjs : supprimer `◉ ${project}`, garder seulement la date → le ↺ Svelte "remplace" visuellement le `◉`
- Mode-bar : supprimer `◉`/`◦`, border unique verticale entre items
- Stats-bar : supprimer border/background, texte seul discret
- Légende : suppression totale

**Phase 2 (plan séparé)** — refactor sidebar → colonne jgr-ui redimensionnable avec `JgrTabs`

---

### 4. Étapes de modification (6 étapes)

1. **RoadmapViz.svelte** : supprimer `.toolbar`, déplacer `↺` en overlay + `.err-overlay`
2. **roadmap-visualizer.cjs #header** : `◉ project` → date seule + `padding-left: 28px`
3. **mode-bar** : texte `tasks|steps|plan` sans symboles, séparateur `border-right` seul
4. **stats-bar** : `.stat-pill` sans border/bg, opacité réduite
5. **#legend** : suppression HTML + CSS
6. **JS inline `setMode()`** : supprimer les réassignations de `◉`/`◦` sur les boutons

---

### 5. Vérifications clés

- ↺ overlay cliquable au-dessus de l'iframe (pointer-events)
- Régénérer la roadmap après modif de `roadmap-visualizer.cjs` (le HTML est un fichier statique en cache)
- Modes tasks/steps/plan toujours fonctionnels sans les symboles
- Nettoyage CSS des classes inutiles dans RoadmapViz.svelte