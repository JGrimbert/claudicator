# Plan — Regroupement automatique d'issues par mot-clé

## 1. Analyse du problème

### Contexte

L'utilisateur identifie manuellement que 5 issues partagent le mot-clé "token". Il n'existe pas encore d'algorithme capable de détecter automatiquement ces regroupements thématiques basés sur les titres/corps d'issues.

L'objectif est de :
1. **Détecter automatiquement** les groupes d'issues partageant un mot-clé saillant
2. **Proposer à l'utilisateur** de créer une issue parente pour chaque groupe détecté
3. **Générer le titre et la description** de cette issue parente via Claude Haiku
4. **Créer l'issue parente** sur GitHub et y attacher les issues du groupe comme sub-issues

### Ce qui existe déjà

| Mécanisme existant | Limites |
|---|---|
| `detectPotentialDuplicates()` (Jaccard sur titres) | Trouve des paires similaires, pas des groupes |
| Coalescence via symboles cartographie | Basé sur symboles code, pas sur sémantique des titres |
| `getSubIssues()` / `createIssue()` dans `github.ts` | Fonctions de base disponibles |
| `buildAnalysisPrompt()` dans `issue-analysis.ts` | Mention des sub-issues dans le prompt d'analyse |

### Ce qui manque

- Un algorithme de **clustering par fréquence de mots-clés** sur les titres/corps d'issues
- Une API pour **créer une issue parente** et y rattacher des sub-issues GitHub
- Un appel à **Haiku** pour générer le titre et la description de l'issue parente
- Un composant UI pour **afficher les groupes détectés** et déclencher la création

---

## 2. Localisation des usages

### Fichiers à créer

```
src/lib/server/agent/issue-grouping.ts     ← algorithme de détection des groupes
src/routes/api/issues/groups/+server.ts    ← GET : retourne les groupes détectés
src/routes/api/issues/group-parent/+server.ts  ← POST : crée l'issue parente
src/lib/components/IssueGroups.svelte      ← UI : affichage des groupes + bouton créer
```

### Fichiers à modifier

| Fichier | Modification |
|---|---|
| `src/lib/server/services/github.ts` | Ajouter `addSubIssue(owner, repo, parentNumber, childNumber)` |
| `src/lib/server/agent/issue-analysis.ts` | Réutiliser `prepareIssues()` (pas de modif, juste import) |
| `src/lib/components/IssueAnalysis.svelte` | Intégrer `<IssueGroups>` dans le panneau existant |

---

## 3. Stratégie d'implémentation

### 3.1 Algorithme de détection des groupes

**Principe** : fréquence de mots-clés saillants sur les titres des issues.

```
Étapes :
1. Tokeniser les titres de toutes les issues ouvertes
   → minuscules, suppression stopwords (le, la, les, de, d', un, une, the, a, an, for, with…)
   → mots de longueur ≥ 3

2. Calculer la fréquence de chaque mot sur l'ensemble des titres

3. Sélectionner les mots "saillants" :
   → présents dans ≥ 2 issues (seuil configurable)
   → pas trop universels (< 80% des issues)

4. Pour chaque mot saillant :
   → collecter toutes les issues dont le titre contient ce mot
   → si ≥ 2 issues : créer un groupe candidat

5. Proposer déduplication des groupes :
   → si deux groupes partagent exactement les mêmes issues → fusionner les mots-clés
   → proposer de ne garder seulement les groupes "maximaux" (ensemble d'issues non inclus dans un groupe plus grand)

6. Score du groupe = nombre d'issues × log(fréquence du mot)

7. Trier par score DESC
```

**Type de retour** :

```typescript
type IssueGroup = {
  keyword: string;           // mot-clé commun (ex : "token")
  keywords: string[];        // tous les mots-clés si fusion
  issues: {
    number: number;
    title: string;
  }[];
  score: number;
  hasParent: boolean;        // true si une sub-issue parente existe déjà
};
```

### 3.2 Génération du titre/description via Haiku

Appel à Claude Haiku (modèle `claude-haiku-4-5-20251001`) via le SDK Anthropic.

**Prompt** :

```
Tu es un assistant de gestion de projet GitHub.
Voici un groupe d'issues liées par le mot-clé "<keyword>" :
<liste des titres>

Génère :
1. Un titre court (< 60 caractères) pour une issue parente qui regroupe ces issues
2. Une description Markdown (3-5 phrases) expliquant le thème commun et listant les sous-issues avec #numéro

FORMAT :
TITRE: <titre>
DESCRIPTION:
<description markdown>
```

**Parsing de la réponse** :
- Extraire `TITRE:` → ligne suivante
- Extraire `DESCRIPTION:` → tout ce qui suit

### 3.3 Création de l'issue parente sur GitHub

Séquence d'opérations :
1. `createIssue(owner, repo, title, body)` → obtenir `parentNumber`
2. Pour chaque issue du groupe : `addSubIssue(owner, repo, parentNumber, childNumber)`

L'API GitHub pour les sub-issues utilise :
```
POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues
Body: { sub_issue_id: <id de l'issue enfant> }
Header: Accept: application/vnd.github+json
```

Note : `getSubIssues` utilise déjà la preview `v2022-11-28` — réutiliser ce pattern.

---

## 4. Étapes de modification du code

### Étape 1 — Algorithme de détection (`issue-grouping.ts`)

Créer `src/lib/server/agent/issue-grouping.ts` avec :

```typescript
// Stopwords FR+EN
const STOPWORDS = new Set([...]);

function tokenize(text: string): string[]

function detectIssueGroups(
  issues: { number: number; title: string; body?: string | null }[],
  options?: { minIssues?: number; maxFreqRatio?: number }
): IssueGroup[]
```

Seuils par défaut :
- `minIssues = 3` (groupe d'au moins 3 issues)
- `maxFreqRatio = 0.8` (mot présent dans < 80% des issues)

### Étape 2 — Service GitHub : addSubIssue

Dans `src/lib/server/services/github.ts`, ajouter :

```typescript
export async function addSubIssue(
  owner: string,
  repo: string,
  parentNumber: number,
  childId: number  // l'id GitHub (pas le numéro) de l'issue enfant
): Promise<void>
```

Note : l'API sub-issues de GitHub nécessite l'**id** (node_id ou numeric id) et non le `number`. `getIssue()` retourne déjà l'objet complet via Octokit — vérifier que `id` est bien présent.

### Étape 3 — API GET `/api/issues/groups`

Créer `src/routes/api/issues/groups/+server.ts` :

```typescript
// GET → retourne les groupes détectés
export const GET: RequestHandler = async () => {
  const project = await getCurrentProject();
  const issues = await getIssuesWithBodies(project.owner, project.repo);
  const groups = detectIssueGroups(issues, { minIssues: 3 });
  return json(groups);
};
```

### Étape 4 — API POST `/api/issues/group-parent`

Créer `src/routes/api/issues/group-parent/+server.ts` :

```typescript
// POST { keyword, issueNumbers[] }
// 1. Charger les issues concernées (titre)
// 2. Appeler Haiku pour générer titre + description
// 3. createIssue() → parentNumber
// 4. Pour chaque issue : getIssue() → obtenir id → addSubIssue()
// 5. Retourner { parentNumber, title, body }
```

**Appel Haiku** : utiliser `@anthropic-ai/sdk` directement (pas via spawn claude).

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const message = await client.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 512,
  messages: [{ role: 'user', content: buildHaikuPrompt(keyword, issues) }]
});
```

### Étape 5 — Composant UI `IssueGroups.svelte`

Affichage :
- Section "Groupes détectés" avec un badge par groupe
- Pour chaque groupe : mot-clé en titre, liste des issues avec `IssueChip`, score
- Bouton "Créer issue parente" → appel POST `/api/issues/group-parent`
- Spinner pendant la génération Haiku + création
- Affichage de l'issue créée (lien GitHub)

### Étape 6 — Intégration dans `IssueAnalysis.svelte`

Ajouter un onglet ou une section "Regroupements" dans le panneau existant qui charge `<IssueGroups>`.

---

## 5. Vérifications et nettoyage final

### Régressions à éviter

| Risque | Vérification |
|---|---|
| `addSubIssue` utilise l'id et non le numéro | Vérifier que `getIssue()` expose bien `.id` dans la réponse Octokit |
| Haiku non disponible (réseau, quota) | Wrapper try/catch avec message d'erreur explicite |
| Groupe détecté alors qu'une parente existe déjà | Champ `hasParent` dans `IssueGroup` : vérifier sub-issues existantes avant affichage |
| Stopwords incomplets → faux positifs | Tester sur les issues réelles du projet lolve |
| Seuil `minIssues = 3` trop bas | Rendre configurable via paramètre query `?min=5` |
| `@anthropic-ai/sdk` pas installé | Vérifier `package.json` — si absent, ajouter |

### Tests manuels

1. Charger les issues du projet → vérifier que les groupes "token" apparaissent
2. Cliquer "Créer issue parente" → vérifier l'issue créée sur GitHub
3. Vérifier que les 5 issues "token" apparaissent bien en sub-issues sur GitHub
4. Vérifier que le titre/description Haiku est cohérent
5. Recharger → vérifier que `hasParent = true` masque le bouton "Créer"

### Nettoyage

- Aucun fichier de plan à supprimer
- Vérifier que `issue-grouping.ts` est bien dans `src/lib/server/` (jamais bundlé côté browser)
- Documenter le seuil `minIssues` dans un commentaire dans `issue-grouping.ts`
