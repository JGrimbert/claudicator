J'ai maintenant une vue complète des trois problèmes. Voici le plan.

---

## Plan : Cartographie claudicator — 3 bugs à corriger

### 1. Analyse du problème

**Bug A — `project-diagram.md` : seulement 5 méthodes**
La commande `annotate diagram` de lolve-cartography est conçue pour des projets ayant une structure `src/prima` (lolve). Elle filtre explicitement sur ce dossier. Pour claudicator, elle ne trouve que les rares méthodes qu'elle considère comme "classes" (DELETE, PATCH, GET, POST des routes). Le `method-index.json` lui, contient bien ~100+ méthodes.

**Bug B — "Index ou src/prima introuvable"**
L'endpoint `GET /api/cartography/diagram` (`diagram/+server.ts:53`) vérifie `existsSync(join(PROJECT_PATH, "src/prima"))`. Claudicator n'a pas de `src/prima` → l'endpoint échoue systématiquement → la vue "codebase" (DiagramViewer) affiche cette erreur.

**Bug C — Symboles: rien**
`loadSymbolMap` filtre strictement sur `kwScore > 0`. Les méthodes de claudicator n'ont pas de `description` (rôle `internal` partout, pas d'enrichissement via `annotate full`). Pour un titre de tâche générique, les mots-clés peuvent ne matcher aucun nom/fichier de méthode → 0 résultats.

---

### 2. Localisation des usages

| Fichier | Ligne | Rôle |
|---|---|---|
| `src/routes/api/cartography/diagram/+server.ts` | 53 | Vérification `existsSync(primaPath)` — bloquante |
| `src/routes/api/cartography/diagram/+server.ts` | 72–73 | Filtre sur `src/prima` uniquement |
| `src/lib/server/agent/context.ts` | 133 | `scored.filter(s => s.kwScore > 0)` — filtre strict |
| `src/lib/components/DiagramViewer.svelte` | `onMount` | Appelle `GET /api/cartography/diagram` |
| `src/lib/components/MethodsViewer.svelte` | `onMount` | Appelle `GET /api/tasks/{id}/methods` |
| `.cache/project-diagram.md` | — | Stale, généré pour prima uniquement |

---

### 3. Stratégie de remplacement

**Bug B (prioritaire)** : Rendre le mode `prima` optionnel dans `diagram/+server.ts`.
- Si `src/prima` existe → comportement actuel (arbre d'héritage prima)
- Si `src/prima` absent → mode générique : grouper les méthodes par module (basé sur le chemin du fichier), sans filtrage prima, sans arbre d'héritage. Retourner un `tree` plat par dossier.

**Bug A** : Après correction du Bug B, la commande `annotate diagram` (côté lolve-cartography) peut être rejouée. Mais ce n'est pas urgent : `DiagramViewer` affiche le tree retourné par l'API, pas le fichier `.cache/project-diagram.md` directement. Le `project-diagram.md` est utilisé comme contexte dans les prompts (`loadConceptMap`). Voir Bug A — étape 3.

**Bug C** : Ajouter un fallback dans `loadSymbolMap` — si aucun symbole n'a `kwScore > 0`, ne pas retourner vide mais retourner les top-N méthodes non-privées triées par `total` (roleBonus). Ceci est hors de la contrainte "rôle seul ne suffit pas" : le fallback ne s'active que si vraiment aucun keyword ne matche. Autre option moins préférée : lancer `annotate full` sur claudicator pour enrichir les descriptions.

---

### 4. Étapes de modification du code

**Étape 4.1 — `diagram/+server.ts` : mode générique si pas de prima** *(Bug B)*

```
diff: diagram/+server.ts
- if (!existsSync(indexPath) || !existsSync(primaPath)) {
-     return json({ error: "Index ou src/prima introuvable" }, { status: 404 });
- }
+ if (!existsSync(indexPath)) {
+     return json({ error: "Index introuvable — lance annotate index" }, { status: 404 });
+ }
+ const isPrima = existsSync(primaPath);
```

Puis ajouter une branche `if (!isPrima)` après le chargement de `allMethods` :
- Grouper les méthodes par fichier (clé = dossier relatif)
- Construire un `tree` plat (1 `TreeNode` par fichier, `depth: 0`, `extendsClass: null`)
- Retourner `{ summary: { total, described }, tree }`

**Étape 4.2 — `project-diagram.md` : mettre à jour** *(Bug A)*

Le fichier `.cache/project-diagram.md` est lu par `loadConceptMap` dans `prompt.ts` et injecté dans le prompt agent. Sa valeur actuelle (5 méthodes) est trompeuse.

Option retenue : après correction de 4.1, relancer `annotate diagram` via l'UI → le fichier sera régénéré avec la vraie structure. Alternativement, mettre à jour `loadConceptMap` pour lire les stats depuis le `method-index.json` si `project-diagram.md` ne contient que peu de méthodes (heuristique `< 10`).

**Étape 4.3 — `context.ts` : fallback loadSymbolMap** *(Bug C)*

```
diff: context.ts (loadSymbolMap)
  const selected = scored.filter(s => s.kwScore > 0).slice(0, SYMBOL_MAP_MAX);
+
+ // Fallback : aucun keyword match → top-N par rôle (évite retour vide)
+ if (selected.length === 0) {
+     return scored.slice(0, SYMBOL_MAP_MAX);  // déjà triés par total (roleBonus)
+ }
```

Note : ce fallback retourne les méthodes les mieux scorées par rôle uniquement, ce qui reste utile mais moins précis. Le flag `kwScore > 0` reste la règle principale.

---

### 5. Vérifications et nettoyage

- [ ] `GET /api/cartography/diagram` → retourne 200 avec `tree` générique pour claudicator (groupé par fichier)
- [ ] `DiagramViewer` affiche les méthodes de claudicator sans erreur
- [ ] `GET /api/tasks/{id}/methods` → retourne au moins N méthodes pour toute tâche de claudicator (fallback activé si 0 match)
- [ ] Bouton "Symboles" affiche bien le MethodsViewer avec des résultats
- [ ] Relancer `annotate diagram` via l'UI → `project-diagram.md` mis à jour avec les vraies stats
- [ ] Vérifier que `loadConceptMap` lit le fichier régénéré correctement dans les prompts
- [ ] Aucune régression sur lolve : les projets avec `src/prima` doivent continuer à utiliser le mode héritage