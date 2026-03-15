# Plan — Parser l'historique Git et annoter les clusters

## 1. Analyse du problème

### Contexte actuel
L'onglet **Clusters** (`/api/clusters`) calcule uniquement à partir de l'état courant :
- Cartographie lolve (snapshot présent)
- Issues GitHub ouvertes

Il ne sait pas :
- quels symboles ont été co-modifiés dans le passé
- quelles issues ont touché les mêmes méthodes
- si la cartographie a dérivé par rapport aux commits analysés

### Objectif
Construire un **arbre du passé** : pour chaque commit lié à une issue, extraire les symboles modifiés, croiser avec la cartographie présente pour filtrer les méthodes obsolètes (stale), et enrichir l'onglet Clusters avec des nœuds de coalescence historiques.

### Problème du stale
En itérant du commit le plus récent vers le plus ancien, un drift croissant s'installe :
- Un symbole `foo()` renommé en `bar()` il y a 10 commits → `foo` n'existe plus dans la cartographie
- Une méthode supprimée → inutile de collecter des informations dessus
- La détection stale doit se faire **par rapport à l'état courant de la cartographie**, pas à l'état au moment du commit

### Flag "à jour"
L'onglet Clusters doit afficher si l'analyse est à jour avec HEAD. Lors de la première utilisation, elle ne l'est pas. On peut déclencher une boucle de collecte progressive.

---

## 2. Localisation des usages

### Fichiers à créer

| Fichier | Rôle |
|---|---|
| `src/lib/server/services/git-history.ts` | Types, lecture/écriture du store `.agent/git-history/`, fonctions d'analyse |
| `src/routes/api/git-history/+server.ts` | GET status + liste de commits analysés |
| `src/routes/api/git-history/run/+server.ts` | POST → SSE streaming de la boucle de collecte |
| `.agent/git-history/state.json` | État global de l'analyse (HEAD, dernier commit analysé, compteurs) |
| `.agent/git-history/commits/<sha>.json` | Analyse par commit (issues ref, symboles, stale flags) |
| `.agent/git-history/index.json` | Index global symbole → commits + issues |

### Fichiers à modifier

| Fichier | Modification |
|---|---|
| `src/lib/server/services/git.ts` | Ajouter `getCommitLog`, `getCommitDiff`, `getHeadCommit` |
| `src/routes/api/clusters/+server.ts` | Enrichir la réponse avec `historical`, `isUpToDate`, `analyzedCommits` |
| `src/lib/components/PlanPanel.svelte` | Badge "à jour" + bouton "Analyser l'historique" dans l'onglet clusters |
| `src/lib/components/ArtifactViewer.svelte` | Idem (vue issue) |

---

## 3. Modèle de données

### `GitHistoryState` (`.agent/git-history/state.json`)
```typescript
type GitHistoryState = {
  lastAnalyzedCommit: string | null;  // SHA le plus ancien analysé
  headAtLastRun:      string | null;  // HEAD au moment du dernier run
  analyzedCount:      number;         // nombre de commits traités
  skippedCount:       number;         // commits sans issue ref
  isUpToDate:         boolean;        // lastAnalyzedCommit === HEAD actuel ?
};
```

### `CommitAnalysis` (`.agent/git-history/commits/<sha>.json`)
```typescript
type CommitSymbol = {
  key:        string;   // clé cartographique (ex: "services/git.ts::commitAll")
  file:       string;   // chemin fichier
  changeType: 'added' | 'modified' | 'deleted';
  isStale:    boolean;  // n'existe plus dans la cartographie actuelle
};

type CommitAnalysis = {
  sha:       string;
  message:   string;
  date:      string;        // ISO 8601
  author:    string;
  issueRefs: number[];      // issues détectées dans le message
  symbols:   CommitSymbol[];
};
```

### `SymbolHistoryEntry` (`.agent/git-history/index.json`)
```typescript
type SymbolHistoryEntry = {
  key:      string;
  file:     string;
  commits:  { sha: string; date: string; issueRefs: number[] }[];
  coIssues: number[];  // toutes les issues qui ont touché ce symbole
  isStale:  boolean;
};

type HistoryIndex = {
  symbols: Record<string, SymbolHistoryEntry>;
  updatedAt: string;
};
```

### Extension de `ClustersResponse`
```typescript
type ClustersResponse = {
  // existant
  dirs:  DirCluster[];
  mixed: MixedCluster[];
  coal:  CoalNode[];
  // nouveau
  historical: {
    coal:             CoalNode[];   // coalescence issue de l'historique git
    isUpToDate:       boolean;
    analyzedCommits:  number;
    headCommit:       string | null;
  };
};
```

---

## 4. Étapes de modification du code

### Étape 1 — Méthodes Git supplémentaires

**Fichier : `src/lib/server/services/git.ts`**

Ajouter trois fonctions :

```typescript
// Liste des commits : sha|message|author|date (du plus récent au plus ancien)
export async function getCommitLog(
  root: string,
  limit = 500
): Promise<{ sha: string; message: string; author: string; date: string }[]>
// → git log --format="%H|%s|%ae|%aI" --max-count=<limit>

// Diff d'un commit spécifique (unified=0 pour minimiser le bruit)
export async function getCommitDiff(root: string, sha: string): Promise<string>
// → git diff <sha>^! --unified=0
// → si premier commit (pas de parent) : git show <sha> --unified=0 --format=""

// SHA de HEAD
export async function getHeadCommit(root: string): Promise<string>
// → git rev-parse HEAD
```

---

### Étape 2 — Service `git-history.ts`

**Fichier : `src/lib/server/services/git-history.ts`**

#### 2a. Stockage

```typescript
const HISTORY_DIR   = path.join(".agent", "git-history");
const COMMITS_DIR   = path.join(HISTORY_DIR, "commits");
const STATE_FILE    = path.join(HISTORY_DIR, "state.json");
const INDEX_FILE    = path.join(HISTORY_DIR, "index.json");

function getState():        GitHistoryState
function saveState(s):      void
function getCommitAnalysis(sha): CommitAnalysis | null
function saveCommitAnalysis(a):  void
function getIndex():        HistoryIndex
function saveIndex(idx):    void
```

#### 2b. Détection des références d'issues

```typescript
function parseIssueRefs(message: string): number[]
```

Regex : `/(?:fix(?:es)?|close[sd]?|resolve[sd]?)?\s*#(\d+)/gi`
Capture : `#12`, `fix #12`, `closes #12`, `resolves #12`

#### 2c. Parser de diff → symboles

```typescript
function extractChangedSymbols(
  diff:    string,
  root:    string
): CommitSymbol[]
```

Algorithme :
1. Découper le diff en sections par fichier (`diff --git a/X b/Y`)
2. Pour chaque fichier → extraire le nom de la fonction/méthode depuis les lignes `@@ -L,N +L,N @@ <context>`
3. La portion après `@@` contient souvent le nom de la fonction en contexte
4. Regex : `/@@[^@]*@@\s*(.+)/` → extraire le token de contexte
5. Chercher dans cartographie : `searchMethods(contextToken, root)` avec score minimum 1
6. Si aucun résultat → symbole non-identifiable, ignorer
7. Marquer `isStale` si `searchMethods` retourne 0 résultats pour ce symbole dans le fichier courant
8. Normaliser `changeType` :
   - Fichier ajouté (ligne `new file mode`) → `added`
   - Fichier supprimé (ligne `deleted file mode`) → `deleted`
   - Sinon → `modified`

#### 2d. Fonction principale d'analyse d'un commit

```typescript
export async function analyzeCommit(
  sha:     string,
  message: string,
  author:  string,
  date:    string,
  root:    string
): Promise<CommitAnalysis>
```

1. Parser `issueRefs` depuis le message
2. Si `issueRefs` vide → retourner `{ sha, message, date, author, issueRefs: [], symbols: [] }`
3. Obtenir le diff via `getCommitDiff(root, sha)`
4. Extraire `symbols` via `extractChangedSymbols(diff, root)`
5. Sauvegarder et retourner l'analyse

#### 2e. Mise à jour de l'index global

```typescript
export function rebuildIndex(root: string): HistoryIndex
```

Parcourt tous les fichiers `commits/<sha>.json`, reconstruit `index.json` :
- Par symbole : liste des commits + issues
- Filtre les `isStale: true` de l'index pour ne garder que les actifs

#### 2f. Vérification "à jour"

```typescript
export async function checkUpToDate(root: string): Promise<boolean>
```

Compare `state.headAtLastRun` avec `getHeadCommit(root)`.

---

### Étape 3 — Route `GET /api/git-history`

**Fichier : `src/routes/api/git-history/+server.ts`**

```typescript
// GET → état de l'analyse + 20 derniers commits analysés
export async function GET(): Promise<Response>
// Retourne : { state: GitHistoryState, recentCommits: CommitAnalysis[] }
```

---

### Étape 4 — Route `POST /api/git-history/run` (SSE)

**Fichier : `src/routes/api/git-history/run/+server.ts`**

Boucle de collecte progressive :

```typescript
export async function POST(): Promise<Response>
```

Algorithme :
1. Lire `state.json` → connaître les commits déjà analysés (via les fichiers `commits/<sha>.json`)
2. Obtenir la liste complète des commits via `getCommitLog(root, 1000)`
3. Filtrer les commits non encore analysés
4. Pour chaque commit non analysé (du plus récent vers le plus ancien) :
   - Appeler `analyzeCommit(...)`
   - Émettre SSE : `{ type: "progress", sha, issueRefs, symbolCount, staleCount }`
   - Si `issueRefs.length === 0` → émettre `{ type: "skip", sha }`
5. Après la boucle : `rebuildIndex(root)` + mettre à jour `state.json`
6. Émettre `{ type: "done", analyzed, skipped, headCommit }`

**Format SSE** :
```
data: {"type":"progress","sha":"abc123","issueRefs":[12,14],"symbolCount":3,"staleCount":1}\n\n
data: {"type":"skip","sha":"def456"}\n\n
data: {"type":"done","analyzed":42,"skipped":18,"headCommit":"xyz789"}\n\n
```

---

### Étape 5 — Enrichissement de `/api/clusters`

**Fichier : `src/routes/api/clusters/+server.ts`**

Après le calcul existant (dirs, mixed, coal), ajouter :

```typescript
// Charger l'index historique
const histIndex = getIndex();           // depuis git-history.ts
const isUpToDate = await checkUpToDate(root);

// Construire symbolToHistIssues : symbole → issues (histo)
const symbolToHistIssues = new Map<string, Set<number>>();
const issueToHistSymbols = new Map<number, Set<string>>();

for (const [key, entry] of Object.entries(histIndex.symbols)) {
  if (entry.isStale) continue;
  for (const issNum of entry.coIssues) {
    if (!symbolToHistIssues.has(key)) symbolToHistIssues.set(key, new Set());
    symbolToHistIssues.get(key)!.add(issNum);
    if (!issueToHistSymbols.has(issNum)) issueToHistSymbols.set(issNum, new Set());
    issueToHistSymbols.get(issNum)!.add(key);
  }
}

// Réutiliser l'algorithme de coalescence existant sur symbolToHistIssues / issueToHistSymbols
const historicalCoal = computeCoalescence(symbolToHistIssues, issueToHistSymbols, symbolDir);

return json({
  dirs, mixed, coal,
  historical: {
    coal: historicalCoal,
    isUpToDate,
    analyzedCommits: getState().analyzedCount,
    headCommit: getState().headAtLastRun,
  }
});
```

Extraire la logique de coalescence en fonction réutilisable `computeCoalescence(...)` au sein du même fichier.

---

### Étape 6 — UI : badge + bouton dans l'onglet Clusters

**Fichier : `src/lib/components/PlanPanel.svelte`**

Dans l'onglet `clusters` :

```
┌─────────────────────────────────────────────────────┐
│ Clusters   [À jour ✓] ou [Analyse incomplète (42 commits)]  │
│                            [Analyser l'historique →] │
├─────────────────────────────────────────────────────┤
│ Dirs   Mixed   Coalescence   Historique              │
└─────────────────────────────────────────────────────┘
```

- **Badge** : appel `GET /api/git-history` au montage du composant
  - Si `state.isUpToDate` → badge vert "À jour"
  - Sinon → badge orange "Analyse incomplète" + nombre de commits en attente
- **Bouton** : `POST /api/git-history/run` → SSE progress
  - Spinner pendant l'analyse
  - Compteur temps réel : "12/87 commits..."
  - Après `done` → recharger les clusters
- **Onglet "Historique"** : affiche `historical.coal` (même format que coalescence actuelle)
  - Label distinctif "co-modifiés (historique)"

**Fichier : `src/lib/components/ArtifactViewer.svelte`**

Dans la vue clusters d'une issue spécifique :
- Badge identique (à jour / incomplet)
- Section "Coalescence historique" si `historical.coal` contient des nœuds impliquant cette issue

---

## 5. Vérifications et nettoyage final

### Cas limites
- [ ] **Premier commit** (pas de parent) : `git diff <sha>^!` échoue → fallback sur `git show <sha> --unified=0 --format=""`
- [ ] **Commits de merge** : deux parents → utiliser `git diff <sha>^1 <sha>` (diff par rapport au premier parent seulement)
- [ ] **Symboles non identifiables** (lignes `@@` sans contexte de fonction) → ignorer silencieusement
- [ ] **Relance partielle** : si l'analyse est interrompue à mi-chemin, la prochaine exécution reprend où elle s'est arrêtée (fichiers `commits/<sha>.json` existants → skip)
- [ ] **Nouveau commit** sur HEAD → `isUpToDate` passe à `false` automatiquement (comparaison dynamique)
- [ ] **Repo sans historique** (0 commits) → retourner état vide, pas d'erreur

### Vérifications de non-régression
- [ ] Le calcul existant (dirs, mixed, coal) reste identique — les données historiques sont additives
- [ ] Un index vide (`.agent/git-history/index.json` absent) → `historical.coal = []`, `isUpToDate = false`
- [ ] La route `/api/clusters` reste performante même si l'index contient des milliers de symboles (O(n²) sur symboles fréquents, garder le même seuil `iss.size >= 2`)
- [ ] Pas de régression TypeScript : types `ClustersResponse` étendus de manière additive (propriété `historical` optionnelle pour la compatibilité)

### Nettoyage
- Les fichiers `commits/<sha>.json` ne sont jamais écrasés (idempotence) — seule la re-détection stale peut les mettre à jour
- Un script de nettoyage futur (hors scope) pourrait purger les commits très anciens (> 6 mois) pour réduire la taille du store
- Le dossier `.agent/git-history/` doit être ajouté au `.gitignore` du projet cible (pas de claudicator)
