Je vais d'abord explorer le code existant pour produire un plan précis.
J'ai maintenant tous les éléments nécessaires. Voici le plan.

---

## Plan : Intégration de l'Atlas lolve-carto dans les prompts

---

### 1. Analyse du problème

lolve-carto génère deux fichiers statiques dans `C:/lolve-cartography/ai/` :
- `atlas.compressed.md` (47 lignes) — architecture, modules, signatures API
- `atlas.dependencies.md` (84 lignes) — graphe de dépendances inter-modules

Ces fichiers ne sont actuellement jamais injectés dans les prompts envoyés à Claude. La cartographie est uniquement utilisée de manière programmatique (MethodSearch, SearchSession) pour les symbol maps et snippets de code.

L'objectif est d'injecter ces atlas en **préambule de chaque prompt** (plan et implémentation) sous forme de contexte "system" + sections ATLAS, afin que Claude travaille avec une vue architecturale complète sans avoir à explorer le code source.

---

### 2. Localisation des usages

| Fichier | Fonction | Type de prompt |
|---|---|---|
| `src/lib/server/agent/prompt.ts:82` | `formatPrompt()` | Prompt plan (génération de plan) |
| `src/lib/server/agent/prompt.ts:176` | `formatImplementationPrompt()` | Prompt implémentation |
| `src/lib/server/agent/context.ts:74` | `buildContext()` | Assembleur → appelle `formatPrompt` |
| `src/routes/api/agent/run/+server.ts:39` | Appel direct | Appelle `formatImplementationPrompt` |
| `src/routes/api/agent/preview-prompt/+server.ts:29` | Appel direct | Appelle `formatImplementationPrompt` |
| `src/lib/server/agent/prompt.ts:16` | `ProjectDocs` | Type doc actuel (à étendre ou compléter) |

---

### 3. Stratégie de remplacement

Pas de remplacement de l'existant. **Ajout en complément** :

1. Nouveau type `AtlasData` + fonction `loadAtlas()` dans `prompt.ts`
2. Injection dans `PromptOptions` (optionnel, `atlas?: AtlasData`)
3. Dans `formatPrompt` et `formatImplementationPrompt` : section **ATLAS** en préambule si présent
4. Dans `buildContext()` : charger l'atlas et le passer aux opts
5. Dans `run/+server.ts` et `preview-prompt/+server.ts` : pareil pour `formatImplementationPrompt`

L'atlas est optionnel à chaque point d'appel — si `LC_PATH` est absent ou les fichiers manquent, aucune régression.

---

### 4. Étapes de modification du code

**Étape 1 — `prompt.ts` : nouveau type + fonction de chargement**

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

**Étape 2 — `prompt.ts` : étendre `PromptOptions`**

Ajouter `atlas?: AtlasData` dans le type `PromptOptions`.

**Étape 3 — `prompt.ts:formatPrompt()` : injection atlas**

Injecter en début de prompt (avant `TASK`) si atlas présent :

```
CONTEXT
You are an AI agent integrated with lolve-cartography...
[instructions décrites dans l'énoncé]

ATLAS COMPRESSÉ
<contenu atlas.compressed.md>

ATLAS DÉPENDANCES
<contenu atlas.dependencies.md>
```

**Étape 4 — `prompt.ts:formatImplementationPrompt()` : même injection**

Même bloc CONTEXT + ATLAS en préambule, avant `TASK`.

**Étape 5 — `context.ts:buildContext()` : charger l'atlas**

```ts
import { formatPrompt, loadConceptMap, loadProjectDocs, loadAtlas } from "./prompt";
// ...
const atlas = loadAtlas();
ctx.prompt = formatPrompt(ctx, { description, conceptMap, projectDocs, methods, atlas });
```

**Étape 6 — `run/+server.ts` : passer l'atlas à `formatImplementationPrompt`**

```ts
import { formatImplementationPrompt, loadProjectDocs, loadAtlas } from "$lib/server/agent/prompt";
// ...
const atlas = loadAtlas();
prompt = formatImplementationPrompt(task, plan, methods, docs, atlas);
```

**Étape 7 — `preview-prompt/+server.ts` : même ajout**

Même import `loadAtlas`, même passage en paramètre.

---

### 5. Vérifications et nettoyage final

- **Optionnalité** : les fichiers atlas peuvent être absents (premier run, LC_PATH mal configuré) — la fonction `loadAtlas` retourne `null` dans ce cas et le prompt est généré sans atlas, sans erreur.
- **Taille** : atlas total ~131 lignes, raisonnable pour un contexte Claude.
- **Tests manuels** :
  - Générer un plan via l'UI → vérifier que le prompt prévisualisé contient la section ATLAS
  - Lancer une implémentation → vérifier la section ATLAS dans les logs de la console
  - Tester avec `LC_PATH` absent → vérifier qu'aucune erreur n'est levée
- **Nettoyage** : aucun code existant supprimé, les symbol maps et snippets restent complémentaires à l'atlas (granularité différente).

---

Fichier plan sauvegardé dans `plans/` ?
Plan sauvegardé dans `plans/lolve-carto-atlas-integration.md`.

---

## Résumé du plan

### 1. Analyse du problème
`atlas.compressed.md` et `atlas.dependencies.md` existent dans `C:/lolve-cartography/ai/` mais ne sont jamais injectés dans les prompts. La cartographie est utilisée programmatiquement (MethodSearch) mais pas via ces fichiers statiques.

### 2. Localisation des usages
5 points d'impact :
- `formatPrompt()` → prompt plan
- `formatImplementationPrompt()` → prompt implémentation  
- `buildContext()` → assembleur (appelle `formatPrompt`)
- `run/+server.ts` et `preview-prompt/+server.ts` → appellent `formatImplementationPrompt` directement

### 3. Stratégie
Ajout non destructif : nouveau type `AtlasData` + fonction `loadAtlas()`, paramètre optionnel `atlas?` dans `PromptOptions`, injection en préambule de chaque prompt (contexte system + sections ATLAS).

### 4. Étapes (7 modifications ciblées)
1. `prompt.ts` — ajouter `AtlasData` + `loadAtlas()`
2. `prompt.ts` — étendre `PromptOptions` avec `atlas?`
3. `prompt.ts:formatPrompt()` — injecter CONTEXT + ATLAS COMPRESSÉ + ATLAS DÉPENDANCES
4. `prompt.ts:formatImplementationPrompt()` — même injection
5. `context.ts:buildContext()` — charger et passer l'atlas
6. `run/+server.ts` — charger et passer l'atlas
7. `preview-prompt/+server.ts` — charger et passer l'atlas

### 5. Vérifications
- Optionnalité garantie (aucune régression si fichiers absents)
- Tests manuels : prompt plan + prompt implémentation + LC_PATH absent