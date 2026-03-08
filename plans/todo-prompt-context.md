# Plan : Prompt contextuel de l'agent

## Objectif

Fusionner les 4 premiers TODOs de `src/routes/+page.svelte` (lignes 9–296) en un seul TODO structuré, puis implémenter le pipeline complet de génération du prompt contextualisé pour l'agent.

Ces TODOs décrivent tous le même flux :

```
Item sélectionné (issue / task / todo)
        ↓
Scan du codebase (lolve-cartography)
        ↓
Construction de l'objet Context
        ↓
Prompt prérempli
        ↓
Lancement de l'agent
```

---

## Pipeline détaillé

### 1. Sélection de l'item

L'utilisateur sélectionne un item parmi :
- une GitHub issue
- une task agent
- une TODO du codebase

Cet item devient le point d'entrée du contexte.

### 2. Construction de l'objet `Context`

Via `lolve-cartography`, scanner le codebase pour produire :

#### Symbol Map
Détecter les classes, méthodes, fonctions exportées.

```
Class Orb
  - upgradeApices()
  - via()

Class Biblio
  - createVertex()
```

Regex à utiliser :
```js
const classRegex = /class\s+(\w+)/g
const methodRegex = /(\w+)\s*\(/g
const exportRegex = /export\s+function\s+(\w+)/g
const importRegex = /import\s+.*from\s+['"](.*)['"]/g
```

#### Call Graph (heuristique)
Détecter les appels de méthodes inter-classes :

```
Biblio.createVertex
  → Vertex.nova
  → Rosa.prima

Orb.upgradeApices
  → Clavis.replaceSlot
```

Regex :
```js
const callRegex = /(\w+)\.(\w+)\(/g
```

#### Dépendances fichier
```
Orb.js
  imports:
    Clavis
    Vertex
```

#### Concept Map
Fichier manuel `concepts.json` (généré par l'IA via lolve-cartography) :
```json
{
  "Vertex": "sommet topologique",
  "Orb": "structure circulaire de slots",
  "Clavis": "index des slots",
  "Unda": "propagation topologique",
  "Axis": "chaîne de formae alignées"
}
```

### 3. Format du prompt final

```
TASK
#283 — Génération grille
Propagation de 4444 pour produire grille X*Y.

OBJECTIF
Créer Axis permettant d'étendre une chaîne de Formae.

CONCEPTS
Vertex → sommet topologique
Orb → structure circulaire de slots
Clavis → index des slots
Unda → propagation topologique

SYMBOL MAP
Biblio
  createVertex()
Orb
  upgradeApices()
Clavis
  replaceSlot()

CALL GRAPH
Biblio.createVertex
  → Vertex.nova
  → Rosa.prima

Orb.upgradeApices
  → Clavis.replaceSlot

DEPENDENCIES
Orb.js
  → Clavis
  → Vertex

MATCHES
score 24
TestReporter.printReport
src/prima/TestReporter.js

TOPOLOGY FLOW
Seed
  → Vertex.nova
  → Orb generation
  → Unda propagation
  → Axis construction
```

### 4. Input UI de l'agent

Dans la colonne des tasks :
- Textarea préremplie avec le prompt ci-dessus
- L'en-tête est formulé automatiquement : "Créer un plan pour réaliser la tâche"
- Le contexte (Symbol Map, Call Graph, Concepts) est adjoint automatiquement
- Bouton "Lancer l'agent" pour démarrer l'exécution avec ce prompt

---

## Composants techniques à créer

| Composant | Emplacement | Rôle |
|-----------|-------------|------|
| `cartography.ts` | `src/lib/server/services/` | Scanner le codebase, produire Symbol Map + Call Graph |
| `context.ts` | `src/lib/server/agent/` | Assembler l'objet `Context` depuis un item sélectionné |
| `prompt.ts` | `src/lib/server/agent/` | Formater le prompt final à partir du `Context` |
| `AgentInput.svelte` | `src/lib/components/` | Textarea préremplie + bouton lancement |
| API route | `src/routes/api/context/` | Endpoint pour générer le contexte depuis le client |

---

## Étapes d'implémentation

1. **Fusionner les 4 TODOs** en un seul dans `+page.svelte` (cette étape)
2. Créer `src/lib/server/services/cartography.ts` (scanner regex)
3. Créer `src/lib/server/agent/context.ts` (assembleur de contexte)
4. Créer `src/lib/server/agent/prompt.ts` (formateur de prompt)
5. Créer l'API route `/api/context`
6. Créer `AgentInput.svelte` avec textarea préremplie
7. Intégrer `AgentInput` dans la colonne des tasks

---

## Fichiers concernés

- `src/routes/+page.svelte` — fusion des TODOs (étape courante)
- `src/lib/server/services/cartography.ts` — à créer
- `src/lib/server/agent/context.ts` — à créer
- `src/lib/server/agent/prompt.ts` — à créer
- `src/lib/components/AgentInput.svelte` — à créer
- `src/routes/api/context/+server.ts` — à créer
- `concepts.json` — à générer via lolve-cartography
