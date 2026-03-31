# Skill : Cluster context-atlas

Protocole de navigation et d'expérience accumulée sur le cluster génération de contexte / Atlas.

## Périmètre (23+18+12+10+~40 touches git)

| Fichier | Responsabilité |
|---|---|
| `src/lib/server/agent/context.ts` | Point d'entrée — construit `AgentContext` (SYMBOL MAP + prompt) |
| `src/lib/server/agent/prompt.ts` | `formatPrompt` — structure TASK/OBJECTIF/CONTRAINTES/SYMBOL MAP |
| `src/lib/server/agent/atlas.ts` | `generateAtlasStrings` — génère le contenu d'ATLAS.md |
| `src/lib/server/agent/segments.ts` | `classifyFile` — classe un fichier dans un segment (ui/server/agent...) |
| `src/lib/server/agent/skills.ts` | `selectSkill` — sélectionne le skill à injecter dans le contexte |
| `src/lib/server/services/cartography.ts` | `searchMethods`, `getSessionWithCode`, index des méthodes |
| `src/routes/api/context/+server.ts` | API lecture du contexte courant |
| `src/routes/api/cartography/+server.ts` | API cartographie (index méthodes) |
| `src/routes/api/cartography/diagram/+server.ts` | Génération diagramme |
| `src/routes/api/cartography/comment/+server.ts` | Ajout commentaire sur symbole |
| `src/routes/api/cartography/snippet/+server.ts` | Lecture snippet de méthode |
| `src/routes/api/cartography/run/+server.ts` | Relance l'indexation |

## Architecture

### Pipeline de génération de contexte
```
buildContext(task)
  → searchMethods(task.title) → MethodSnippet[]
  → scoring kwScore (strict — kwScore > 0 requis, rôle seul insuffisant)
  → symbolMap: Record<string, SymbolGroup>
  → selectSkill(task) → Skill (fichier .claude/commands/ pertinent)
  → formatPrompt(task, symbolMap, skill) → string
  → AgentContext { task, symbolMap, prompt, skill }
```

### SYMBOL MAP
- Filtre strict : `kwScore > 0` — un symbole avec rôle seul mais sans score kwScore est exclu
- Format dans le prompt : section `## SYMBOL MAP` avec file, signatures, snippets tronqués (max 20 lignes)

### Atlas
Généré dans `ATLAS.md` à la racine. Contient :
- **Points d'entrée** : fichiers pertinents pour l'issue
- **Snippets** : code des méthodes les plus chaudes
- **Index** : tous les symboles indexés

### Sections supprimées du prompt (historique)
- PROJECT DIAGRAM — supprimé (trop verbeux)
- CALL GRAPH — supprimé (inutile)

## Protocole d'entrée

1. Lire `src/lib/server/agent/context.ts` entier
2. Lire `src/lib/server/agent/prompt.ts` si modif format prompt
3. Lire `src/lib/server/agent/atlas.ts` si modif Atlas
4. Lire `cartography.ts` si modif scoring/indexation

## Expérience accumulée

### Pitfalls connus
_(vide — se remplit après les issues)_

### Patterns validés
_(vide)_

### Leçons d'issues passées

| Issue | Date | Leçon |
|---|---|---|
