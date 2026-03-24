# Plan : Atlas comme fondation de navigation dans les plans

## 1. Analyse du problème

### Symptôme observé

Quand Claude Code prépare un plan sur claudicator, il fait 15-20 appels d'exploration :

```
⚙ Glob src/lib/components/**/*.svelte
⚙ Glob src/routes/**/*.svelte
⚙ Bash find "C:\claudicator\src" -type f -name "*.ts" -o -name "*.svelte"
⚙ Read src/routes/+page.svelte
⚙ Read src/lib/components/IssueAnalysis.svelte
⚙ Read src/lib/components/TaskList.svelte
⚙ Grep Lancer l'implémentation
...
```

Ce pattern d'exploration aveugle est coûteux en tokens, lent, et peut rater des fichiers pertinents.

### Cause racine

L'Atlas symbolique de claudicator **existe** (visible dans l'onglet ATLAS du panel) et fonctionne déjà
pour le projet claudicator via lolve-cartography. Claude Code lui-même n'a cependant pas accès
à un index symbolique exploitable directement — il ne sait pas que l'Atlas est disponible ni
comment le consulter avant d'explorer.

### Ce qui manque concrètement

Un fichier `ATLAS.md` accessible par Claude Code dès le démarrage d'une tâche, avec :
1. L'index symbolique global de claudicator (par région sémantique)
2. Une section **Points d'entrée** spécifique à l'issue en cours — les symboles identifiés
   comme pertinents pour cette issue via `loadSymbolMap(root, issueQuery)`

### Idée bonus : issues coalescentes

L'Atlas croisé avec les issues GitHub permettrait d'identifier les issues qui touchent
les mêmes symboles/fichiers. Présentation sous forme d'arbo dans IssueAnalysis.

---

## 2. Localisation des usages

### Fichiers concernés

| Fichier | Rôle actuel |
|---|---|
| `src/lib/server/services/cartography.ts` | Wrapper lolve-cartography : `searchMethods`, `generateAtlasStrings`, `getSnippet` |
| `src/lib/server/agent/context.ts` | `buildContext`, `loadSymbolMap` — générique, prend `root` |
| `src/lib/server/agent/prompt.ts` | `formatPrompt` — sections ATLAS, SYMBOL MAP, DOCUMENTATION |
| `src/routes/api/atlas/+server.ts` | Endpoint Atlas — retourne atlas compressé pour une query |
| `CLAUDE.md` | Instructions de navigation pour Claude Code (à enrichir) |
| `.claude/skills/` | Skills invocables — **à créer** (répertoire inexistant) |

### Ce qui existe déjà (réutilisable sans modification)

- `cartography.ts::searchMethods(query, root)` — indexe n'importe quel projet
- `context.ts::loadSymbolMap(root, query)` — construit le SYMBOL MAP pour n'importe quel root
- `prompt.ts::formatPrompt` — inclut déjà ATLAS + SYMBOL MAP dans les prompts agent

### Ce qui manque

1. Un **fichier ATLAS.md** lisible par Claude Code, généré à la demande
2. Une **section Points d'entrée** dans ATLAS.md : symboles pertinents pour l'issue liée
3. Un **skill Claude Code** qui instrumente la navigation par Atlas
4. Une **section Navigation** dans CLAUDE.md pour orienter Claude Code

---

## 3. Stratégie

### Approche retenue : ATLAS.md injecté dans le prompt via toggle

Le toggle **ATLAS** dans l'onglet plan contrôle l'inclusion d'`ATLAS.md` dans le prompt
envoyé à Claude Code. Quand le toggle est activé, le contenu du fichier est lu et inséré
directement dans le prompt — remplaçant l'ancienne injection dynamique via `formatPrompt`.

#### Couche A — ATLAS.md (fichier généré, lu au moment du spawn)

Générer un fichier `ATLAS.md` à la racine de claudicator. Format : section **Points d'entrée**
en tête (symboles pertinents pour l'issue liée), puis index global par région sémantique.

Ce fichier est **lu au moment du spawn** si le toggle ATLAS est actif. Son contenu remplace
l'ancienne section ATLAS calculée dynamiquement dans `formatPrompt`.

#### Couche B — Issues coalescentes (bonus, découplé)

Endpoint `/api/atlas/coalesce` : pour une issue donnée, retourner les issues qui partagent
les mêmes symboles/fichiers. Présentation dans IssueAnalysis.

---

## 4. Étapes de modification du code

### Étape 1 — Vérifier que searchMethods fonctionne pour claudicator

**Fichier cible :** `src/lib/server/services/cartography.ts`

L'Atlas est déjà visible dans l'onglet ATLAS du panel — vérifier que `searchMethods`
fonctionne correctement avec `root = C:/claudicator` depuis le serveur (pas seulement l'UI).

**Test de validation :**
```ts
const methods = await searchMethods("TaskList Lancer implémentation", "C:/claudicator");
// Doit retourner les méthodes de TaskList.svelte, AgentInput.svelte, etc.
```

### Étape 2 — Endpoint de génération d'ATLAS.md avec points d'entrée

**Nouveau endpoint :** `src/routes/api/atlas/generate/+server.ts`

Paramètres : `{ taskId }` (pour récupérer l'issue liée et son titre/description)

Algorithme :
1. Charger `method-index.json` de claudicator via `searchMethods`
2. Grouper par `SemanticRegion` (via `classifyFile`)
3. Extraire les **points d'entrée** via `loadSymbolMap(claudicatorRoot, issue.title + issue.body)`
4. Écrire `ATLAS.md` à la racine avec : section Points d'entrée en tête, puis index global

Format cible de `ATLAS.md` :
```markdown
# Atlas — Claudicator
_Généré pour : Issue #42 — Ajouter bouton Diff_

## Points d'entrée (issue #42)

Ces symboles ont été identifiés comme pertinents pour cette issue :

| Symbole | Fichier | Signature |
|---|---|---|
| `handleDiff` | `src/lib/components/TaskList.svelte` | `handleDiff(taskId: string): void` |
| `getDiff` | `src/lib/server/services/git.ts` | `getDiff(root: string): Promise<string>` |
| `POST /api/git/diff` | `src/routes/api/git/diff/+server.ts` | — |

---

## UI / Composants
- `TaskList.svelte` — `src/lib/components/TaskList.svelte`
  - `handleInitialCommit(taskId)` — déclenche le commit initial de la branche
  - `handleLaunchImpl(taskId)` — lance l'implémentation via console
- `RunConsole.svelte` — `src/lib/components/RunConsole.svelte`
  - `startStream(taskId)` — ouvre le flux SSE de la console
  ...

## Domaine / Agent
- `context.ts` — `src/lib/server/agent/context.ts`
  - `buildContext(task, root, description)` — assemble le contexte agent complet
  - `loadSymbolMap(root, query)` — construit le SYMBOL MAP par query
  ...

## API
- `run/+server.ts` — `src/routes/api/agent/run/+server.ts`
  - `POST /api/agent/run` — spawn claude, SSE stream, save plan
  ...

## Infrastructure / Services
- `cartography.ts` — `src/lib/server/services/cartography.ts`
  - `searchMethods(query, root)` — recherche TF-IDF dans l'index
  - `generateAtlasStrings(root, query)` — génère la vue atlas compressée
  ...
```

**Déclenchement :** bouton "Générer l'Atlas" dans l'onglet plan (ou automatique lors du
"Initial Commit"), qui appelle `POST /api/atlas/generate?taskId=...` et écrit `ATLAS.md`.

### Étape 3 — Lire ATLAS.md dans le prompt quand le toggle est actif

**Fichier cible :** `src/routes/api/agent/run/+server.ts`

Quand le toggle ATLAS est `on` dans la task (champ `atlasEnabled` ou équivalent) :

```ts
let atlasContent = "";
if (task.atlasEnabled) {
  const atlasPath = path.join(claudicatorRoot, "ATLAS.md");
  if (fs.existsSync(atlasPath)) {
    atlasContent = fs.readFileSync(atlasPath, "utf-8");
  }
}
const prompt = formatPrompt({ ...context, atlasContent });
```

Dans `formatPrompt`, remplacer l'ancienne section ATLAS dynamique par le contenu brut du
fichier si `atlasContent` est fourni, sinon ne pas inclure de section ATLAS du tout.

**Ce que ça change par rapport à l'ancien comportement :**
- Avant : `generateAtlasStrings(root, query)` calculait la section ATLAS à chaque spawn
- Après : si toggle actif → contenu d'`ATLAS.md` inséré tel quel (pré-calculé, avec Points d'entrée)
- Si toggle inactif → pas de section ATLAS dans le prompt (comportement neutre)

### Étape 4 — Toggle ATLAS dans l'UI (onglet plan)

**Fichier cible :** composant qui affiche l'onglet plan dans IssueAnalysis

Ajouter un toggle "ATLAS" qui :
1. Persiste dans l'état de la task (`atlasEnabled: boolean`)
2. Appelle `PATCH /api/tasks/:id` pour sauvegarder l'état
3. Affiche le contenu d'`ATLAS.md` en preview quand activé (optionnel)

### Étape 5 — Issues coalescentes (bonus, découplé)

**Nouveau endpoint :** `src/routes/api/atlas/coalesce/+server.ts`

Algorithme :
1. Prendre une issue (titre + description)
2. Extraire les symboles pertinents via `loadSymbolMap(root, query)`
3. Pour chaque symbole, retrouver les issues GitHub qui mentionnent ce fichier/symbole
4. Retourner : `{ issue, relatedIssues: [{issue, commonSymbols: string[]}] }`

**Affichage dans IssueAnalysis :** nouveau panneau "Issues liées" avec arbo des clusters.

---

## 5. Vérifications et nettoyage final

### Tests fonctionnels

- [ ] `ATLAS.md` généré correctement : au moins 20 entrées couvrant les 4 régions, section Points d'entrée présente
- [ ] Toggle ATLAS `on` → prompt contient le contenu d'`ATLAS.md`
- [ ] Toggle ATLAS `off` → pas de section ATLAS dans le prompt
- [ ] Nombre d'appels d'exploration réduit : < 5 au lieu de 15-20
- [ ] Les fichiers référencés dans les plans correspondent à des chemins réels

### Tests de régression

- [ ] L'Atlas de lolve (projet cible) est inchangé
- [ ] `buildContext(task, lolveRoot, ...)` retourne toujours le bon SYMBOL MAP
- [ ] Les endpoints `/api/atlas`, `/api/cartography` fonctionnent toujours pour lolve
- [ ] Les plans générés par l'agent (pour lolve) ne sont pas dégradés
- [ ] L'ancienne section ATLAS dynamique (`generateAtlasStrings`) n'est plus appelée pendant le spawn

### Nettoyage

- [ ] Supprimer ou désactiver l'appel `generateAtlasStrings` dans `formatPrompt` / `run/+server.ts` (remplacé par lecture d'`ATLAS.md`)
- [ ] Vérifier que `.gitignore` n'exclut pas `ATLAS.md` (fichier de navigation, pas un cache)
- [ ] Ajouter `atlasEnabled` au schéma de la task si absent

---

## Résumé des livrables

| Livrable | Type | Priorité |
|---|---|---|
| `ATLAS.md` avec section Points d'entrée (issue) | Fichier généré | Haute |
| `/api/atlas/generate` endpoint | API | Haute |
| Toggle ATLAS dans l'onglet plan + persistance task | UI | Haute |
| Lecture d'`ATLAS.md` dans `run/+server.ts` quand toggle actif | Logique serveur | Haute |
| Suppression de l'ancienne injection ATLAS dynamique dans `formatPrompt` | Nettoyage | Haute |
| Bouton "Générer l'Atlas" dans l'onglet plan | UI | Moyenne |
| `/api/atlas/coalesce` + UI | Feature | Basse (bonus) |
