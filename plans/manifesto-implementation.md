# Plan — Implémentation du Manifeste Claudicator

**Date** : 2026-03-14
**Périmètre** : Réalisation complète de la vision décrite dans le manifeste Claudicator
**Base** : SvelteKit + TypeScript, lolve-cartography, Claude Code CLI

---

## 1. Analyse du problème

### Vision du manifeste

Le manifeste décrit Claudicator comme un système en 5 couches :

| Couche | Concept | Description |
|--------|---------|-------------|
| 1 | **Atlas** | Carte multi-couches du codebase : topologie structurelle, régions sémantiques, clusters conceptuels |
| 2 | **Skill Graph** | Graphe de compétences spécialisées, une skill par type de segment |
| 3 | **Segment-Oriented Intelligence** | Chaque région reçoit le raisonnement adapté à sa nature |
| 4 | **Distributed Cognition** | Réseau d'agents spécialisés plutôt qu'un agent monolithique |
| 5 | **Navigation** | Flux `skill → segment → context → transformation` |

### État actuel

```
Atlas (couche 1 partielle)
  ✓ Index des méthodes (lolve-cartography)
  ✓ Section MODULES + DÉPENDANCES dans generateAtlasStrings()
  ✗ Régions sémantiques (UI / domain / API / infra / tests)
  ✗ Clusters conceptuels (patterns récurrents)
  ✗ Vue topologique des imports

Skill Graph
  ✗ Aucune skill définie en tant qu'entité
  ✗ Pas de registre de compétences

Segment-Oriented Intelligence
  ✗ Les fichiers ne sont pas classifiés par type
  ✗ Le prompt est identique quel que soit le segment cible

Distributed Cognition
  ✗ Un seul agent (planning one-shot + session implémentation)
  ✗ Pas d'orchestration multi-agents

Navigation
  ~ Partiel : context.ts utilise cartography pour construire le contexte
  ✗ Pas de flux skill → segment → context → transformation explicite
```

### Écart à combler

Le projet a les **fondations** (cartography, context, prompt, agent run) mais pas encore :
- la **couche sémantique** de classification des régions
- le **registre de skills** et leur sélection
- l'**orchestration multi-agents**
- l'**interface visuelle** de l'atlas

---

## 2. Localisation des usages

### Fichiers à étendre

| Fichier | Extension requise |
|---------|------------------|
| `src/lib/server/services/cartography.ts` | Ajouter classification sémantique des fichiers, clusters conceptuels |
| `src/lib/server/agent/context.ts` | Sélection de skill basée sur le segment détecté |
| `src/lib/server/agent/prompt.ts` | Injection des instructions de skill dans le prompt |
| `src/routes/api/agent/run/+server.ts` | Orchestration multi-agents (coordinateur + spécialistes) |

### Fichiers à créer

| Fichier | Rôle |
|---------|------|
| `src/lib/server/agent/skills.ts` | Registre des skills (définitions, contraintes, prompts) |
| `src/lib/server/agent/segments.ts` | Classification sémantique des fichiers en régions |
| `src/lib/server/agent/orchestrator.ts` | Coordinateur multi-agents |
| `src/lib/components/AtlasView.svelte` | Visualisation interactive de l'atlas |
| `src/routes/api/atlas/+server.ts` | Endpoint pour obtenir l'atlas enrichi complet |

### Fichiers inchangés

- `src/lib/server/services/git.ts` — aucun changement
- `src/lib/server/services/github.ts` — aucun changement
- `src/lib/server/services/tasks.ts` — aucun changement
- `src/hooks.server.ts` — aucun changement

---

## 3. Stratégie de réalisation

### Approche : phases incrémentales, sans régression

Le manifeste est une vision globale. L'implémentation se fait en **5 phases** indépendantes,
chacune apportant de la valeur sans casser l'existant :

```
Phase 1 : Atlas sémantique enrichi
    ↓ classifie les fichiers en régions
Phase 2 : Skill registry
    ↓ définit les skills disponibles
Phase 3 : Skill-aware context
    ↓ sélectionne la skill selon le segment détecté
Phase 4 : Orchestration distribuée
    ↓ déploie des agents spécialisés par segment
Phase 5 : UI — Atlas visualization
    ↓ interface visuelle de navigation
```

### Principe de non-régression

- Les phases 1 à 3 modifient uniquement des **couches internes** (cartography, context, prompt)
- Le comportement externe (`/api/agent/run`) reste identique jusqu'à la phase 4
- Chaque phase est testable indépendamment via les endpoints existants

---

## 4. Étapes de modification du code

---

### Phase 1 — Atlas sémantique enrichi

**Objectif** : Ajouter la classification des fichiers en régions sémantiques et clusters conceptuels dans `cartography.ts`.

#### 1.1 Créer `src/lib/server/agent/segments.ts`

Définir les régions sémantiques et leurs règles de classification :

```typescript
export type SemanticRegion = 'ui' | 'domain' | 'api' | 'infra' | 'tests' | 'config' | 'store';

export const REGION_RULES: Array<{ pattern: RegExp; region: SemanticRegion }> = [
  { pattern: /src\/lib\/components\//,           region: 'ui' },
  { pattern: /src\/routes\/\+/,                  region: 'ui' },
  { pattern: /src\/routes\/api\//,               region: 'api' },
  { pattern: /src\/lib\/server\/agent\//,        region: 'domain' },
  { pattern: /src\/lib\/server\/services\//,     region: 'infra' },
  { pattern: /src\/lib\/stores\//,               region: 'store' },
  { pattern: /\.(test|spec)\.(ts|js)$/,          region: 'tests' },
  { pattern: /\.(config|env|md)$/,               region: 'config' },
];

export function classifyFile(filePath: string): SemanticRegion {
  for (const { pattern, region } of REGION_RULES) {
    if (pattern.test(filePath)) return region;
  }
  return 'domain'; // fallback
}
```

#### 1.2 Étendre `generateAtlasStrings()` dans `cartography.ts`

Ajouter une section `RÉGIONS` dans la sortie compressée :

```
RÉGIONS
ui         → src/lib/components/ (17 fichiers), src/routes/+*.svelte
domain     → src/lib/server/agent/ (5 fichiers)
infra      → src/lib/server/services/ (10 fichiers)
api        → src/routes/api/ (45 routes)
store      → src/lib/stores/ (1 fichier)
```

#### 1.3 Ajouter la détection des clusters conceptuels

Un cluster est un groupe de fichiers qui partagent des patterns d'import récurrents.
Algorithme :
1. Construire le graphe d'imports (déjà fait dans `buildAtlasDeps`)
2. Détecter les sous-graphes fortement connectés (≥ 3 fichiers)
3. Nommer chaque cluster d'après le fichier avec le plus d'entrants

Sortie dans l'atlas :
```
CLUSTERS CONCEPTUELS
cartography-pipeline → [cartography.ts, context.ts, prompt.ts]
task-workflow        → [tasks.ts, git.ts, processes.ts]
```

---

### Phase 2 — Skill Registry

**Objectif** : Définir les skills comme des entités avec des instructions propres à chaque segment.

#### 2.1 Créer `src/lib/server/agent/skills.ts`

```typescript
export type SkillId = 'ui' | 'domain' | 'api' | 'infra' | 'test' | 'full-stack';

export type Skill = {
  id:           SkillId;
  label:        string;
  regions:      SemanticRegion[];
  constraints:  string[];   // contraintes injectées dans le prompt
  focus:        string;     // description du domaine de compétence
};

export const SKILL_REGISTRY: Record<SkillId, Skill> = {
  ui: {
    id: 'ui',
    label: 'UI / Composants',
    regions: ['ui', 'store'],
    focus: 'layout, réactivité, composabilité Svelte, stores',
    constraints: [
      'Respecter la réactivité Svelte ($: , stores)',
      'Préférer les composants atomiques réutilisables',
      'Ne pas introduire de logique serveur dans les composants',
    ],
  },
  api: {
    id: 'api',
    label: 'API / Contrats',
    regions: ['api'],
    focus: 'contrats d\'API, schémas, versionning, validation des entrées',
    constraints: [
      'Valider toutes les entrées côté serveur',
      'Retourner des erreurs HTTP sémantiques (400/404/500)',
      'Documenter les endpoints modifiés',
    ],
  },
  domain: {
    id: 'domain',
    label: 'Logique Métier',
    regions: ['domain'],
    focus: 'invariants, règles, orchestration agent',
    constraints: [
      'Ne pas coupler la logique métier aux routes',
      'Conserver la séparation planning / implémentation / review',
    ],
  },
  infra: {
    id: 'infra',
    label: 'Infrastructure / Services',
    regions: ['infra'],
    focus: 'intégrité de configuration, services externes, git, GitHub',
    constraints: [
      'Garder le code serveur dans src/lib/server/',
      'Ne jamais exposer de tokens ou secrets',
    ],
  },
  // ...
};
```

#### 2.2 Ajouter un endpoint `/api/skills` (GET)

Retourne la liste des skills disponibles avec leurs régions. Utilisé par l'UI.

---

### Phase 3 — Skill-Aware Context Building

**Objectif** : Dans `context.ts`, détecter le segment de la tâche et sélectionner la skill appropriée. Injecter les instructions de skill dans le prompt.

#### 3.1 Modifier `buildContext()` dans `context.ts`

```typescript
export function buildContext(task, projectRoot, description?): AgentContext {
  const query     = buildQuery(task.title, description);
  const symbolMap = loadSymbolMap(projectRoot, query);

  // Nouveau : détecter les régions touchées par la task
  const affectedFiles = getSessionWithCode(query, projectRoot).map(r => r.file);
  const regions       = [...new Set(affectedFiles.map(classifyFile))];
  const skill         = selectSkill(regions);  // → skill la plus représentée

  // Nouveau : inclure les instructions de skill dans le prompt
  ctx.prompt = formatPrompt(ctx, { description, conceptMap, projectDocs, atlas, skill });
}
```

#### 3.2 Modifier `formatPrompt()` dans `prompt.ts`

Ajouter une section `SKILL` dans le prompt de planning :

```
SKILL : Logique Métier
Focus : invariants, règles, orchestration agent
Contraintes :
- Ne pas coupler la logique métier aux routes
- Conserver la séparation planning / implémentation / review
```

---

### Phase 4 — Orchestration Distribuée (Multi-Agents)

**Objectif** : Implémenter un coordinateur qui dispatche des agents spécialisés selon les segments touchés.

#### 4.1 Créer `src/lib/server/agent/orchestrator.ts`

Le coordinateur :
1. Reçoit une tâche
2. Identifie les segments affectés (via `classifyFile` + cartography)
3. Crée N sous-tâches (une par segment, si multi-segment)
4. Spawn N agents Claude en parallèle, chacun avec la skill appropriée
5. Collecte et fusionne les résultats

```typescript
export type OrchestratorPlan = {
  segments: Array<{
    region:   SemanticRegion;
    skill:    Skill;
    files:    string[];
    plan:     string;
  }>;
  mergedPlan: string;
};
```

#### 4.2 Modifier `/api/agent/run/+server.ts`

Ajouter un mode `orchestrated: true` dans la requête.
Si activé, utiliser `orchestrator.ts` au lieu du flux one-shot actuel.
Les résultats SSE incluent les événements de chaque sous-agent.

#### 4.3 Fichier état de l'orchestration : `.agent/orchestrations/<taskId>.json`

```json
{
  "taskId": "task-123",
  "segments": ["ui", "api"],
  "subAgents": [
    { "segmentId": "ui",  "status": "done",    "planFile": "..." },
    { "segmentId": "api", "status": "running", "planFile": null }
  ],
  "mergedPlan": null
}
```

---

### Phase 5 — UI : Atlas Visualization

**Objectif** : Interface visuelle permettant de naviguer l'atlas et de voir le graphe de skills.

#### 5.1 Créer `src/lib/components/AtlasView.svelte`

Vue principale de l'atlas avec :
- **Carte des régions** : une card par région sémantique (UI / Domain / API / Infra / Tests)
- Pour chaque région : liste des fichiers + skill associée
- **Mise en évidence** lors de la sélection d'une tâche : les régions touchées apparaissent en surbrillance

#### 5.2 Créer `src/lib/components/SkillGraph.svelte`

Graphe interactif montrant :
- Les nœuds = skills
- Les arêtes = flux possibles entre skills (ex : domain → api)
- La skill sélectionnée pour la tâche courante est mise en évidence

#### 5.3 Créer l'endpoint `/api/atlas` (GET)

Retourne l'atlas enrichi complet :

```typescript
type AtlasResponse = {
  regions: Record<SemanticRegion, { files: string[]; methodCount: number }>;
  clusters: Array<{ name: string; files: string[] }>;
  activeSkill?: SkillId;   // si taskId fourni en query param
  topology: { modules: ...; deps: ... };
};
```

#### 5.4 Intégrer `AtlasView` dans `+page.svelte`

Ajouter un onglet "Atlas" dans la navigation principale (à côté de Issues / Tasks).

---

## 5. Vérifications et nettoyage final

### Vérifications fonctionnelles

| Vérification | Comment tester |
|---|---|
| `generateAtlasStrings()` retourne la section RÉGIONS | Appel direct `GET /api/cartography/diagram` |
| La classification `classifyFile()` est correcte | Unit test sur chemins connus (routes/api → api, components → ui) |
| `buildContext()` retourne la skill correcte | `GET /api/agent/preview-prompt?taskId=...` — vérifier la section SKILL |
| Les skills sont injectées dans le prompt | Vérifier dans les logs SSE de `/api/agent/run` |
| L'orchestrateur crée les sous-agents | Test avec une tâche multi-segment |
| L'UI affiche les régions | Navigation manuelle dans l'onglet Atlas |

### Régressions à surveiller

- `buildContext()` : le format du prompt ne doit pas changer pour les tâches mono-segment simples (retour en arrière possible si skill = undefined)
- `generateAtlasStrings()` : la section MODULES et DÉPENDANCES existante doit rester intacte
- `/api/agent/run` en mode non-orchestré : comportement identique à aujourd'hui
- Le spawn Claude (`-p --dangerously-skip-permissions`) ne doit pas être modifié

### Nettoyage final

- Supprimer les TODO créés pendant le développement des phases
- Documenter le format de l'atlas enrichi dans `.cache/atlas-schema.md`
- Mettre à jour `CLAUDE.md` avec la section Architecture enrichie (régions + skills)
- Vérifier que `.agent/orchestrations/` est dans `.gitignore`

---

## Récapitulatif des livrables

| Phase | Livrable | Fichiers |
|---|---|---|
| 1 | Atlas sémantique | `segments.ts`, +`cartography.ts` |
| 2 | Skill registry | `skills.ts`, `/api/skills` |
| 3 | Skill-aware context | +`context.ts`, +`prompt.ts` |
| 4 | Orchestration distribuée | `orchestrator.ts`, +`run/+server.ts`, `/api/atlas` |
| 5 | UI Atlas | `AtlasView.svelte`, `SkillGraph.svelte`, +`+page.svelte` |

**Total** : ~8 fichiers créés, ~4 fichiers modifiés, 2 nouveaux endpoints API.
