# Plan — #121 : Génération initiale de Skills

## 1. Analyse du problème

### Contexte

Les listes **coalescence** et **historique** produisent déjà des clusters de symboles co-occurrents :

- **CoalNode** (`/api/clusters` → `coal[]`) : symboles partagés entre plusieurs issues GitHub.
  `score = symbols.length × issues.length`
- **HistoricalCoalNode** (`.agent/git-history/state.json` → `coal[]`) : symboles co-modifiés dans l'historique git.
  `score = symbols.length × count` (count = nombre de commits)

L'objectif est de transformer **chaque cluster significatif** en une **proposition de skill** en invoquant Claude Haiku en mode non interactif (`-p`) sur un prompt compact décrivant le cluster.

### Critère de filtrage (clusters significatifs)

Exclure les clusters trop petits selon la règle : *"pas de skill avec deux issues et 4 occurrences"*.

Seuils retenus :
- **CoalNode** : `score >= 6`
  (≥ 3 issues × 2 symboles **ou** ≥ 2 issues × 3 symboles)
- **HistoricalCoalNode** : `score >= 9` ET `count >= 3`
  (≥ 3 commits × 3 symboles)

Les nœuds historiques déjà représentés par un `histMatch` sur un CoalNode sont conservés côté sémantique uniquement (pas de doublon).

---

## 2. Localisation des usages

| Fichier | Rôle |
|---|---|
| `src/routes/api/clusters/+server.ts` | Produit `CoalNode[]` + `HistoricalCoalNode[]` |
| `src/lib/server/services/git-history.ts` | `getHistoryState()` → `HistoricalCoalNode[]` |
| `src/lib/server/services/processes.ts` | Référence pour le spawn de sous-processus claude |
| `src/routes/api/agent/run/+server.ts` | Référence pour l'invocation de claude (`-p`, stdin, env) |
| `src/lib/components/PlanPanel.svelte` | Onglet "clusters" → point d'entrée UI naturel |

### Types existants réutilisés

```ts
// clusters/+server.ts
type CoalNode          = { symbols: CoalSymbol[]; issues: number[]; score: number; count: number; histMatch? }
type HistoricalCoalNode = { symbols: string[]; count: number; score: number; issues: number[] }
```

---

## 3. Stratégie

### Architecture ajoutée (pas de remplacement)

Trois nouveaux artefacts, sans modifier l'existant :

```
src/lib/server/services/skills.ts         ← types + persistance
src/routes/api/skills/generate/+server.ts ← route POST (déclenche la génération)
src/routes/api/skills/+server.ts          ← route GET (lit les proposals sauvegardées)
```

Ajout d'un bouton dans `PlanPanel.svelte` (onglet "clusters") pour déclencher la génération depuis l'UI.

### Invocation haiku

```ts
// Pattern basé sur agent/run/+server.ts
import { execSync } from "child_process";

const raw = execSync(
  `claude -p --model claude-haiku-4-5-20251001 --dangerously-skip-permissions`,
  {
    input: prompt,
    env: { ...process.env, ANTHROPIC_API_KEY: undefined, CLAUDECODE: undefined },
    cwd: getProjectRoot(),
    encoding: "utf-8",
    timeout: 30_000,
  }
);
```

Le prompt est passé via **stdin** (pas en argument de ligne de commande) pour éviter les problèmes d'échappement.

### Format de prompt envoyé à haiku (un par cluster)

```
Tu génères un titre de skill à partir d'un cluster de symboles de code.

Cluster:
- Symboles : ensureDir, getTasksDir, listTasks, migrateTaskStatus
- Provenance : historique git (9 commits communs, issues: #115 #119 #122)

Réponds UNIQUEMENT dans ce format exact, sans autre texte :
skill: <intitulé court, forme verbale, orienté action>
source: historical
description: <résumé en une phrase de la compétence>
```

### Type `SkillProposal`

```ts
type SkillProposal = {
  id:              string;       // hash déterministe des symboles du cluster
  skill:           string;       // titre généré par haiku
  source:          "coal" | "historical";
  description:     string;       // résumé court
  clusterSymbols:  string[];     // symboles du cluster source
  clusterIssues:   number[];     // issues liées
  score:           number;       // score du cluster source
  generatedAt:     string;       // ISO 8601
};
```

### Stockage

```
.agent/skills/proposals.json   ← tableau SkillProposal[]
```

---

## 4. Étapes de modification du code

### Étape 1 — `src/lib/server/services/skills.ts` (nouveau)

- Définir le type `SkillProposal`
- `getSkillsDir()` → `.agent/skills/`
- `loadProposals()` → lit `proposals.json`, retourne `[]` si absent
- `saveProposals(proposals: SkillProposal[])` → écrit `proposals.json`
- `buildPrompt(symbols: string[], source: "coal"|"historical", issues: number[], count: number)` → construit le prompt à envoyer à haiku
- `parseHaikuResponse(raw: string)` → extrait `skill:` et `description:` de la réponse texte brute
- `slugify(symbols: string[])` → hash déterministe pour `id`

### Étape 2 — `src/routes/api/skills/generate/+server.ts` (nouveau)

- `POST` handler :
  1. Appel `getHistoryState()` pour récupérer `historical.coal`
  2. Appel interne à la logique clusters (ou appel `fetch("/api/clusters")`) pour récupérer `coal[]`
  3. Filtrage : CoalNodes avec `score >= 6`, HistoricalCoalNodes avec `score >= 9 && count >= 3`
  4. Déduplication : si un HistoricalCoalNode a un `histMatch` dans un CoalNode, on skip côté historique
  5. Pour chaque cluster retenu : `execSync(claude -p haiku, { input: buildPrompt(...) })`
  6. Parse de la réponse → `SkillProposal`
  7. `saveProposals(proposals)`
  8. Retourne `json({ proposals, generated: proposals.length })`

### Étape 3 — `src/routes/api/skills/+server.ts` (nouveau)

- `GET` handler :
  1. `loadProposals()`
  2. Retourne `json(proposals)`

### Étape 4 — `PlanPanel.svelte` (modification mineure)

Dans l'onglet "clusters", section COALESCENCE :
- Ajouter un bouton `Générer les skills` qui appelle `POST /api/skills/generate`
- Afficher un spinner pendant la génération (même pattern que les autres boutons du composant)
- Après succès, afficher les proposals dans un bloc dédié (format compact : `skill` + `description` + badge source)
- En cas d'erreur, afficher un message d'erreur inline

---

## 5. Vérifications et nettoyage final

### Régressions à éviter

- `skills.ts` ne doit pas importer de code côté browser
- `execSync` doit être appelé uniquement côté serveur (dans `src/lib/server/` ou routes)
- Les nouvelles routes doivent retourner `json(...)` sans SSE (la génération est synchrone par cluster, pas de streaming nécessaire)

### Vérifications fonctionnelles

1. Vérifier que `getHistoryState()` retourne des `HistoricalCoalNode[]` non vides avant de générer
2. Vérifier que `score >= 6` et `score >= 9` excluent bien les clusters à faible signal dans les données réelles
3. Vérifier que `parseHaikuResponse` est robuste aux réponses inattendues (fallback : `skill: unknown`, `description: ""`)
4. Vérifier que `saveProposals` crée `.agent/skills/` si absent
5. Vérifier que les proposals sont bien écrasées à chaque regénération (pas d'accumulation)

### Nettoyage final

- Supprimer les `console.log` de debug éventuels dans `skills.ts`
- S'assurer que le bouton UI est désactivé (`disabled`) pendant la requête en cours
- S'assurer que le timeout de 30s par cluster est suffisant (ajuster si besoin selon le nombre de clusters)
