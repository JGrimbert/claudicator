# Plan — Arborescence élégante des endpoints `+server.ts`

**Objectif** : Rendre l'arborescence `src/routes/api/` navigable et lisible dans
un IDE, sans casser le routing SvelteKit ni l'API existante.

---

## 1. Analyse du problème

### Contrainte SvelteKit irréductible

SvelteKit impose que chaque fichier de route soit nommé `+server.ts`. Il est
impossible de le renommer. Dans un IDE, l'arbre ressemble à :

```
api/
  agent/
    run/         +server.ts
    input/       +server.ts
    kill/        +server.ts
    session/     +server.ts
    preview-prompt/ +server.ts
  tasks/
    +server.ts
    [id]/
      +server.ts
      commit/    +server.ts
      diff/      +server.ts
      push/      +server.ts
      revert/    +server.ts
      sync/      +server.ts
      merge/     +server.ts
      ...
```

Le nom de dossier donne du contexte, mais :
- En vue "fichiers ouverts" (onglets IDE), tous les onglets s'intitulent `+server.ts`
- En recherche globale (`Ctrl+P`), la liste est composée de 46 entrées identiques
- Dans `git diff`, les chemins longs masquent la nature du changement
- La logique métier est enfouie dans des fichiers sans identité propre

### Ampleur

- **46 fichiers** `+server.ts` dans `src/routes/api/`
- Aucun n'a de nom distinctif dans les outils de navigation IDE
- La logique métier (parfois 100–200 lignes) est directement dans le fichier de route

### Ce qui est déjà traité

Le plan `identity-slots-codebase.md` ajoute des commentaires JSDoc en tête de
fichier pour le panneau Atlas. Ce plan-ci est **complémentaire** et traite la
navigabilité IDE.

---

## 2. Localisation des usages

### 2a. Fichiers avec logique métier significative (priorité haute)

Ces fichiers ont plus de 50 lignes de logique et bénéficient le plus de
l'extraction :

| Endpoint | Lignes estimées | Complexité |
|----------|----------------|------------|
| `agent/run/+server.ts` | ~150 | SSE, spawn claude, sauvegarde plan |
| `agent/preview-prompt/+server.ts` | ~80 | Context + prompt building |
| `tasks/[id]/initial-commit/+server.ts` | ~80 | Git + GitHub + branch |
| `tasks/[id]/merge/+server.ts` | ~70 | PR GitHub + merge |
| `issues/analyze/+server.ts` | ~100 | SSE, analyse Claude |
| `issues/roadmap/chat/+server.ts` | ~90 | SSE, chat agent |
| `cartography/enrich/+server.ts` | ~80 | SSE, enrichissement |
| `cartography/comment/+server.ts` | ~60 | Génération commentaire |

### 2b. Fichiers minces qui pourraient être consolidés

Ces endpoints n'ont qu'une seule méthode HTTP et moins de 30 lignes :

| Endpoint | Méthode | Candidat à consolidation |
|----------|---------|--------------------------|
| `tasks/[id]/diff/+server.ts` | GET | → `tasks/[id]/git/+server.ts` |
| `tasks/[id]/commit/+server.ts` | POST | → `tasks/[id]/git/+server.ts` |
| `tasks/[id]/push/+server.ts` | POST | → `tasks/[id]/git/+server.ts` |
| `tasks/[id]/revert/+server.ts` | POST | → `tasks/[id]/git/+server.ts` |
| `tasks/[id]/sync/+server.ts` | POST | → `tasks/[id]/git/+server.ts` |
| `agent/input/+server.ts` | POST | → `agent/+server.ts` |
| `agent/kill/+server.ts` | POST | → `agent/+server.ts` |
| `agent/session/+server.ts` | DELETE | → `agent/+server.ts` |

### 2c. Clients frontend concernés

Toute consolidation de route implique de mettre à jour les appels `fetch` côté
client. Fichiers à auditer :

```
src/lib/components/
  RunConsole.svelte       ← /api/agent/run, /api/agent/input, /api/agent/kill
  TaskList.svelte         ← /api/tasks/[id]/*, /api/tasks/[id]/initial-commit
  IssueAnalysis.svelte    ← /api/issues/analyze, /api/issues/roadmap/chat
  CartographyPanel.svelte ← /api/cartography/*
src/routes/
  +page.svelte et dérivés ← /api/projects, /api/issues, /api/tasks
```

---

## 3. Stratégie de remplacement

Deux approches sont possibles, avec des niveaux de risque différents.

### Approche A — Extraction de handlers (recommandée, risque nul)

**Principe** : `+server.ts` devient un stub de routing de 1–3 lignes. La logique
métier est extraite vers un fichier nommé `handler.ts` colocalisé.

```
api/agent/run/
├── +server.ts       ← stub (3 lignes)
└── handler.ts       ← toute la logique POST actuelle
```

`+server.ts` après extraction :
```ts
/** Agent — lance Claude en SSE (POST) */
import type { RequestHandler } from './$types';
export { POST } from './handler';
```

**Avantages :**
- Zéro changement d'API (URL identiques)
- Zéro changement côté frontend
- `handler.ts` apparaît dans `Ctrl+P` avec un nom explicite dans son dossier
- Handlers testables en isolation sans SvelteKit
- SvelteKit supporte nativement le re-export de `GET`/`POST`/etc.

**Inconvénients :**
- Nombre de fichiers total augmente (46 → 92 pour les fichiers extraits)
- La navigation reste basée sur les dossiers, pas les noms

---

### Approche B — Consolidation de routes (risque moyen)

**Principe** : Regrouper les endpoints thématiquement proches dans un seul
`+server.ts` parent, en distinguant par le corps de la requête.

**Exemple — Domaine git des tâches :**

Avant (5 fichiers) :
```
tasks/[id]/commit/+server.ts   POST
tasks/[id]/diff/+server.ts     GET
tasks/[id]/push/+server.ts     POST
tasks/[id]/revert/+server.ts   POST
tasks/[id]/sync/+server.ts     POST
```

Après (1 fichier) :
```
tasks/[id]/git/+server.ts
  GET  → retourne le diff
  POST { action: 'commit' | 'push' | 'revert' | 'sync' }
```

**Avantages :**
- Réduit de 5 fichiers à 1 pour les opérations git
- Structure d'arbre plus compacte

**Inconvénients :**
- **Casse l'API** : tous les clients frontend doivent être mis à jour
- Mélange REST (GET diff) et action-based (POST action=commit)
- Moins idiomatique REST : `/git?action=commit` est moins lisible que `/commit`
- Risque de régression si un client est oublié

---

### Recommandation : Approche A en priorité, B optionnelle pour git tasks

L'approche A est **sans risque** et améliore significativement la navigabilité.
L'approche B peut être appliquée en second temps uniquement sur le domaine git
des tâches (le groupe le plus dense et le plus homogène).

---

## 4. Étapes de modification du code

### Étape 1 — Mise en place du pattern handler (Approche A)

**Ordre de priorité** : commencer par les fichiers les plus complexes pour
valider le pattern, puis étendre aux autres.

#### 1a. Domaine Agent (5 fichiers)

Pour `api/agent/run/` :
1. Créer `handler.ts` avec le contenu actuel de `+server.ts` (exports `POST`)
2. Remplacer `+server.ts` par le stub de 3 lignes
3. Vérifier que SvelteKit résout le re-export (`pnpm dev` + test manuel)

Répéter pour : `input/`, `kill/`, `session/`, `preview-prompt/`

#### 1b. Domaine Tasks [id] (9 fichiers)

Même procédure pour :
`commit/`, `diff/`, `initial-commit/`, `merge/`, `methods/`, `plan/`,
`push/`, `revert/`, `sync/`

#### 1c. Domaine Issues (8 fichiers)

`analyze/`, `analyze/update/`, `roadmap/chat/`, `analysis/`, `roadmaps/`,
`snapshot/`, `[number]/close/`, `issue/` (racine)

#### 1d. Domaine Cartography (9 fichiers)

`cartography/` (racine), `comment/`, `diagram/`, `enrich/`, `methods/`,
`refresh/`, `run/`, `snippet/`, `stats/`

#### 1e. Domaines restants (15 fichiers)

`tasks/` (racine), `tasks/[id]/` (racine), `issues/` (racine),
`projects/`, `projects/current/`, `projects/github/`, `project-config/`,
`context/`, `repo-file/`, `repo-info/`, `atlas/`, `logs/`, `plan/`,
`usage/`, `skills/`, `github/issues/`

---

### Étape 2 — Consolidation git tasks (Approche B, optionnelle)

Si l'équipe valide l'approche B après l'étape 1 :

1. Créer `tasks/[id]/git/+server.ts` avec handlers `GET` (diff) et `POST` (action)
2. Mettre à jour les clients frontend :
   - Remplacer `fetch('/api/tasks/${id}/diff')` → `fetch('/api/tasks/${id}/git')`
   - Remplacer `fetch('/api/tasks/${id}/commit', { method: 'POST' })` →
     `fetch('/api/tasks/${id}/git', { method: 'POST', body: { action: 'commit' } })`
3. Supprimer les 5 anciens dossiers : `commit/`, `diff/`, `push/`, `revert/`, `sync/`

**Ne pas consolider** sans avoir fait l'audit complet des clients.

---

## 5. Vérifications et nettoyage final

### 5a. Vérifications non-régression après chaque étape

| Vérification | Commande / Méthode |
|---|---|
| TypeScript compile | `pnpm check` |
| SvelteKit résout les routes | `pnpm dev` + test de chaque URL dans le navigateur |
| Re-exports reconnus | Vérifier que SvelteKit ne log aucun warning de route |
| Clients frontend intacts | Tester les actions clés : run agent, commit, diff, push |

### 5b. Checklist par fichier traité

Pour chaque `+server.ts` extrait vers `handler.ts` :
- [ ] `handler.ts` a tous les imports nécessaires (transférer depuis `+server.ts`)
- [ ] `+server.ts` stub exporte exactement les mêmes verbes HTTP qu'avant
- [ ] Le commentaire JSDoc du plan #1 est sur le stub `+server.ts` (pas dans `handler.ts`)
- [ ] `pnpm check` passe sans erreur sur ce fichier

### 5c. Résultat attendu dans l'IDE

Après extraction, `Ctrl+P` dans VSCode affiche :

```
Avant                           Après
+server.ts (×46)               +server.ts (×46) — stubs vides
                                handler.ts (×46) — logique nommée par dossier
```

En navigation par dossier :
```
agent/run/
  +server.ts   ← 3 lignes
  handler.ts   ← 150 lignes de logique SSE
```

L'identité vient du chemin : `agent/run/handler.ts` est non-ambigu dans
n'importe quel outil de navigation.

### 5d. Critères de succès

```
Avant : 46 +server.ts avec logique métier enfouie, indiscernables dans Ctrl+P
Après : 46 stubs de 3 lignes + 46 handler.ts nommés par contexte de dossier

Avant (Approche B optionnelle) : 5 endpoints git tasks séparés
Après : 1 endpoint /git avec dispatch d'action
```

---

## Résumé

| Phase | Action | Fichiers | Risque | Impact frontend |
|-------|--------|----------|--------|-----------------|
| 1a | Extraction handlers — Domaine Agent | 5×2 | Nul | Aucun |
| 1b | Extraction handlers — Domaine Tasks | 9×2 | Nul | Aucun |
| 1c | Extraction handlers — Domaine Issues | 8×2 | Nul | Aucun |
| 1d | Extraction handlers — Domaine Cartography | 9×2 | Nul | Aucun |
| 1e | Extraction handlers — Domaines restants | 15×2 | Nul | Aucun |
| 2 | Consolidation git tasks (optionnel) | -4 net | Moyen | Mise à jour fetch |

**La phase 1 est sans risque et peut être faite en une seule session.**
**La phase 2 nécessite un audit frontend préalable et une validation explicite.**
