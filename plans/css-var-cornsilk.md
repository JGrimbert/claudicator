# Plan — Variable CSS `--color-cornsilk`

## 1. Analyse du problème

La couleur `cornsilk` est actuellement utilisée comme valeur littérale directe dans plusieurs composants Svelte.
Elle sert à identifier visuellement les états liés à **l'implémentation** (tâche courante, lancement agent, chip impl, onglet TODO).

Problème : la couleur est dupliquée en dur dans 4 fichiers différents. Si la teinte doit changer, il faut modifier chaque occurrence manuellement, avec risque d'oubli et de régression visuelle.

Solution : centraliser la valeur dans une variable CSS globale `--color-impl` (ou `--text-impl`) définie dans `+layout.svelte`, et remplacer toutes les occurrences.

---

## 2. Localisation des usages

| Fichier | Ligne | Sélecteur | Usage |
|---|---|---|---|
| `src/lib/components/TaskList.svelte` | ~823 | `.filter-btn.task-current` | `color: cornsilk` |
| `src/lib/components/TaskList.svelte` | ~1053 | `.impl-launch-label` | `color: cornsilk` |
| `src/lib/components/IssueAnalysis.svelte` | ~945 | `.issue-chip.chip-impl` | `color: cornsilk` |
| `src/lib/components/AgentInput.svelte` | ~323 | `.ai-launch-label` | `color: cornsilk` |
| `src/lib/components/AgentConsole.svelte` | ~523 | `.tab-todo:hover` | `color: cornsilk` |
| `src/lib/components/AgentConsole.svelte` | ~524 | `.tab-todo.tab-active` | `color: cornsilk` |

**Total : 6 occurrences dans 4 fichiers.**

---

## 3. Stratégie de remplacement

- Définir `--color-impl: cornsilk;` dans le bloc `:root` de `src/routes/+layout.svelte`, après les variables `--text-*` existantes.
- Remplacer chaque occurrence `color: cornsilk` par `color: var(--color-impl)` dans les 4 composants.
- Nom retenu : `--color-impl` (cohérent avec le domaine sémantique = états "implémentation").

---

## 4. Étapes de modification du code

### Étape 1 — Déclarer la variable dans `+layout.svelte`

Dans le bloc `:root`, après `--text-dim`, ajouter :

```diff
  --text-dim:       #333;
+ --color-impl:     cornsilk;
```

### Étape 2 — `TaskList.svelte`

```diff
- .filter-btn.task-current { color: cornsilk; }
+ .filter-btn.task-current { color: var(--color-impl); }

- .impl-launch-label { color: cornsilk; }
+ .impl-launch-label { color: var(--color-impl); }
```

### Étape 3 — `IssueAnalysis.svelte`

```diff
- .issue-chip.chip-impl  { color: cornsilk; background: #1a1200; border-color: #4a3a00; }
+ .issue-chip.chip-impl  { color: var(--color-impl); background: #1a1200; border-color: #4a3a00; }
```

### Étape 4 — `AgentInput.svelte`

```diff
- .ai-launch-label { color: cornsilk; }
+ .ai-launch-label { color: var(--color-impl); }
```

### Étape 5 — `AgentConsole.svelte`

```diff
- .tab-todo:hover { color: cornsilk; }
- .tab-todo.tab-active { color: cornsilk; }
+ .tab-todo:hover { color: var(--color-impl); }
+ .tab-todo.tab-active { color: var(--color-impl); }
```

---

## 5. Vérifications et nettoyage final

- [ ] Rechercher `cornsilk` dans tout le projet → doit retourner 0 résultat après migration
- [ ] Vérifier visuellement dans le navigateur :
  - Bouton filtre "tâche courante" dans TaskList
  - Label "Lancer l'implémentation" dans TaskList
  - Chip impl dans IssueAnalysis
  - Label agent dans AgentInput
  - Onglet TODO (hover + actif) dans AgentConsole
- [ ] S'assurer que la variable `--color-impl` est bien déclarée dans `:root` avant tout composant qui l'utilise (c'est le cas via `+layout.svelte`)
- [ ] Pas de changement visuel attendu — le rendu doit être identique à l'état actuel
