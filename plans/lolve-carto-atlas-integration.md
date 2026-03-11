# Plan : Intégration de l'Atlas lolve-carto dans les prompts

## 1. Analyse du problème

lolve-carto génère deux fichiers statiques dans `C:/lolve-cartography/ai/` :
- `atlas.compressed.md` (47 lignes) — architecture, modules, signatures API
- `atlas.dependencies.md` (84 lignes) — graphe de dépendances inter-modules

Ces fichiers ne sont actuellement **jamais injectés** dans les prompts envoyés à Claude.
La cartographie est uniquement utilisée de manière programmatique (MethodSearch, SearchSession)
pour les symbol maps et snippets de code.

L'objectif est d'injecter ces atlas en **préambule de chaque prompt** (plan et implémentation)
sous forme d'un contexte "system" + sections ATLAS, afin que Claude travaille avec une vue
architecturale complète sans avoir à explorer le code source.

---

## 2. Localisation des usages

| Fichier | Fonction | Type de prompt |
|---|---|---|
| `src/lib/server/agent/prompt.ts:82` | `formatPrompt()` | Prompt plan (génération de plan) |
| `src/lib/server/agent/prompt.ts:176` | `formatImplementationPrompt()` | Prompt implémentation |
| `src/lib/server/agent/context.ts:74` | `buildContext()` | Assembleur → appelle `formatPrompt` |
| `src/routes/api/agent/run/+server.ts:39` | Appel direct | Appelle `formatImplementationPrompt` |
| `src/routes/api/agent/preview-prompt/+server.ts:29` | Appel direct | Appelle `formatImplementationPrompt` |
| `src/lib/server/agent/prompt.ts:16` | `ProjectDocs` | Type doc actuel (inchangé) |

---

## 3. Stratégie

Pas de remplacement de l'existant — **ajout en complément** :

1. Nouveau type `AtlasData` + fonction `loadAtlas()` dans `prompt.ts`
2. Paramètre `atlas?: AtlasData` dans `PromptOptions`
3. Dans `formatPrompt` et `formatImplementationPrompt` : section ATLAS en préambule si présent
4. Dans `buildContext()` : charger l'atlas et le passer aux opts
5. Dans `run/+server.ts` et `preview-prompt/+server.ts` : même ajout pour `formatImplementationPrompt`

L'atlas est **optionnel** à chaque point d'appel — si `LC_PATH` est absent ou les fichiers
manquent, aucune régression.

---

## 4. Étapes de modification du code

### Étape 1 — `prompt.ts` : nouveau type + fonction de chargement

Ajouter après les types existants :

```ts
export type AtlasData = {
    compressed:   string | null;
    dependencies: string | null;
};

/** Charge les fichiers atlas depuis LC_PATH/ai/. Retourne null si absents. */
export function loadAtlas(): AtlasData {
    const lcPath = process.env.LC_PATH ?? "C:/lolve-cartography";
    const read = (name: string): string | null => {
        try { return fs.readFileSync(path.join(lcPath, "ai", name), "utf-8"); }
        catch { return null; }
    };
    return {
        compressed:   read("atlas.compressed.md"),
        dependencies: read("atlas.dependencies.md"),
    };
}
```

### Étape 2 — `prompt.ts` : étendre `PromptOptions`

Ajouter `atlas?: AtlasData` dans le type `PromptOptions`.

### Étape 3 — `prompt.ts:formatPrompt()` : injection atlas

Injecter en **début de prompt** (avant `TASK`) si atlas présent :

```
CONTEXT
You are an AI agent integrated with lolve-cartography, a project located at `C:/lolve-cartography`, which contains:
* `C:/lolve-cartography/ai/atlas.compressed.md` — Compressed Code Atlas (architecture, modules, API signatures, key flows)
* `C:/lolve-cartography/ai/atlas.dependencies.md` — Dependency Atlas (function/module call graph)

Agent instructions:
1. Always consult the lolve-cartography Atlas first.
2. Never read source files unless absolutely necessary.
3. Map client prompts to Atlas concepts (classes, functions, methods, modules).
4. Generate answers using Atlas only — follow API signatures strictly, respect dependency flows.
5. Do not invent functions/classes not in the Atlas.

ATLAS COMPRESSÉ
<contenu atlas.compressed.md>

ATLAS DÉPENDANCES
<contenu atlas.dependencies.md>
```

### Étape 4 — `prompt.ts:formatImplementationPrompt()` : même injection

Même bloc CONTEXT + sections ATLAS en préambule, avant `TASK`.

### Étape 5 — `context.ts:buildContext()` : charger et passer l'atlas

```ts
import { formatPrompt, loadConceptMap, loadProjectDocs, loadAtlas } from "./prompt";
// ...
const atlas = loadAtlas();
ctx.prompt = formatPrompt(ctx, { description, conceptMap, projectDocs, methods, atlas });
```

### Étape 6 — `run/+server.ts` : passer l'atlas à `formatImplementationPrompt`

```ts
import { formatImplementationPrompt, loadProjectDocs, loadAtlas } from "$lib/server/agent/prompt";
// ...
const atlas = loadAtlas();
prompt = formatImplementationPrompt(task, plan, methods, docs, atlas);
```

### Étape 7 — `preview-prompt/+server.ts` : même ajout

Même import `loadAtlas`, même passage en paramètre.

---

## 5. Vérifications et nettoyage final

- **Optionnalité** : `loadAtlas()` retourne `{ compressed: null, dependencies: null }` si
  `LC_PATH` est absent ou les fichiers manquent — aucune erreur levée, prompt généré normalement.
- **Taille** : atlas total ~131 lignes, raisonnable pour un contexte Claude.
- **Tests manuels** :
  - Générer un plan via l'UI → vérifier que le prompt prévisualisé contient la section ATLAS
  - Lancer une implémentation → vérifier la section ATLAS dans les logs de la console
  - Tester avec `LC_PATH` absent → vérifier qu'aucune erreur n'est levée
- **Nettoyage** : aucun code existant supprimé — symbol maps et snippets restent
  complémentaires à l'atlas (granularité différente).
