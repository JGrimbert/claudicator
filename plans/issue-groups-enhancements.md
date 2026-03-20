# Plan : Améliorations de la vue Regroupements

**Contexte** : 12 groupes, 46 issues en groupe, 30 hors-groupe, 12 parentés.
**Objectif** : Cinq améliorations ciblées sur `IssueGroups.svelte` et son écosystème.

---

## 1. Analyse du problème

| Fonctionnalité | État actuel | Cible |
|---|---|---|
| Issues hors-groupe | Comptées dans les stats, non listées | Groupe spécial "hors-groupes" en bas |
| Jumeaux | Aucune détection | Marquer les issues au sujet identique dans chaque groupe |
| Subdivisions | Aucune | Proposer des sous-groupes pour les groupes larges (>3 non-jumeaux) |
| Links #ids | `<span>` sans lien | Ouvrir la issue dans le panel artefact gauche |
| CTA Haïkus | Absent | Bouton global → titre + description pour chaque groupe |

---

## 2. Localisation des usages

| Fichier | Rôle impacté |
|---|---|
| `src/lib/server/agent/issue-grouping.ts` | Types `IssueGroup`, algorithme `detectIssueGroups` |
| `src/routes/api/issues/groups/+server.ts` | GET API — response shape, stats |
| `src/lib/components/IssueGroups.svelte` | UI principale — tous les changements visuels |
| `src/lib/stores/agent.ts` | Store `agentState` → déjà utilisé dans `PlanPanel` et `IssueAnalysis` |
| `src/routes/api/issues/groups/haikus/+server.ts` | **Nouvelle route** à créer |

Fichiers **non touchés** : `RoadmapViz.svelte` (consomme `IssueCluster`, pas `IssueGroup`),
`group-parent/+server.ts`, `issue-grouping.ts` sauf extension des types.

---

## 3. Stratégie

- Étendre le type `IssueGroup` plutôt que réécrire l'algorithme.
- Tout calcul (jumeaux, subdivisions, issues hors-groupe) côté serveur dans l'API existante.
- L'UI reste dans `IssueGroups.svelte` — aucun nouveau composant.
- La route haïku suit le pattern de `group-parent/+server.ts` (Claude Haiku).
- Le lien `#id` suit le pattern déjà présent dans `PlanPanel.svelte` et `IssueAnalysis.svelte`.

---

## 4. Étapes de modification

### Étape 1 — Étendre le type `IssueGroup` (issue-grouping.ts)

**Fichier** : `src/lib/server/agent/issue-grouping.ts`

Ajouter deux propriétés au type exporté :

```ts
export type IssueGroup = {
    keyword: string;
    keywords: string[];
    issues: { number: number; title: string }[];
    score: number;
    hasParent: boolean;
    // NOUVEAU
    twins: number[][];          // groupes d'issues au sujet identique ex: [[12,34],[56,78]]
    subdivisions: {
        keyword: string;
        keywords: string[];
        issues: { number: number; title: string }[];
    }[];
};
```

**Calcul des jumeaux** (à ajouter à la fin de `detectIssueGroups`, avant le `return`) :

```
Pour chaque groupe :
  - Construire une empreinte pour chaque issue :
    empreinte = Set des stems des tokens du titre
                sérialisé en string triée
  - Regrouper les issues par empreinte identique
  - twins = tableau des groupes de taille >= 2
```

**Calcul des subdivisions** (après calcul des jumeaux) :

```
Pour chaque groupe dont (issues.length - nombre d'issues en jumeaux) > 3 :
  - Filtrer les issues "uniques" (non-jumelles ou un seul représentant par groupe de jumeaux)
  - Relancer detectIssueGroups(issuesUniques, { minIssues: 2 })
  - Garder les sous-groupes dont toutes les issues sont dans le groupe parent
  - Exclure tout sous-groupe qui égale le groupe entier
  - Stocker dans subdivisions[]
```

Initialiser `twins: []` et `subdivisions: []` pour chaque groupe par défaut.

---

### Étape 2 — Étendre la réponse API (groups/+server.ts)

**Fichier** : `src/routes/api/issues/groups/+server.ts`

Ajouter dans la réponse finale les issues hors-groupe :

```ts
// Après calcul de issueNumbersInGroups :
const ungroupedIssues = issues
    .filter(i => !issueNumbersInGroups.has(i.number))
    .map(i => ({ number: i.number, title: i.title }));

return json({ groups: result, ungroupedIssues, stats });
```

Les champs `twins` et `subdivisions` sont déjà portés par chaque groupe grâce à l'étape 1.

---

### Étape 3 — Nouvelle route haïkus (groups/haikus/+server.ts)

**Fichier** : `src/routes/api/issues/groups/haikus/+server.ts` *(à créer)*

Pattern identique à `group-parent/+server.ts` :

```
POST /api/issues/groups/haikus
Body: { groups: { keyword: string; keywords: string[]; issueTitles: string[] }[] }

Pour chaque groupe :
  - Appel Claude Haiku (claude-haiku-4-5-20251001)
  - Prompt : "Génère un titre court (3-5 mots) et une description (1 phrase)
              qui résument l'intention de ce groupe d'issues.
              Issues : <liste des titres>
              Format JSON : { title: string, description: string }"
  - Parser la réponse JSON

Retourne : { haikus: Record<keyword, { title: string, description: string }> }
```

Gestion d'erreur : si un groupe échoue, inclure `err: string` dans la valeur au lieu de title/description.

---

### Étape 4 — Mise à jour du composant IssueGroups.svelte

**Fichier** : `src/lib/components/IssueGroups.svelte`

#### 4a. Imports et types

Ajouter en haut du `<script>` :
```ts
import { agentState } from "$lib/stores/agent";

// Étendre le type IssueGroup local :
type IssueGroup = {
    // ... existant ...
    twins: number[][];
    subdivisions: { keyword: string; keywords: string[]; issues: { number: number; title: string }[] }[];
};

// Nouveau :
let ungroupedIssues: { number: number; title: string }[] = $state([]);
let haikus: Record<string, { title: string; description: string; err?: string }> = $state({});
let haikuLoading = $state(false);
```

#### 4b. Mettre à jour `loadGroups`

```ts
ungroupedIssues = data.ungroupedIssues ?? [];
```

#### 4c. Fonction `openIssue` (lien vers panel artefact)

Copier le pattern de `PlanPanel.svelte:195` :
```ts
async function openIssue(n: number) {
    agentState.update(s => ({ ...s, status: "loading", plan: null }));
    try {
        const res = await fetch(`/api/issue?number=${n}`);
        if (!res.ok) return;
        const full = await res.json();
        agentState.update(s => ({
            ...s, issue: full, status: "idle", navigationStack: [],
            knownSubIssueNumbers: [...new Set([
                ...s.knownSubIssueNumbers,
                ...(full.subIssues?.map((si: any) => si.number) ?? [])
            ])]
        }));
    } catch {
        agentState.update(s => ({ ...s, status: "idle" }));
    }
}
```

#### 4d. Fonction `generateHaikus`

```ts
async function generateHaikus() {
    haikuLoading = true;
    try {
        const r = await fetch("/api/issues/groups/haikus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                groups: groups.map(g => ({
                    keyword: g.keyword,
                    keywords: g.keywords,
                    issueTitles: g.issues.map(i => i.title)
                }))
            })
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        haikus = data.haikus ?? {};
    } finally {
        haikuLoading = false;
    }
}
```

#### 4e. Template HTML — modifications

**En haut (après le header, avant la liste) :**
```svelte
<div class="haiku-cta">
    <button class="btn-haiku" onclick={generateHaikus} disabled={haikuLoading || groups.length === 0}>
        {haikuLoading ? "Génération…" : "✦ Générer les haïkus"}
    </button>
</div>
```

**Issues : remplacer `<span class="issue-num">` par un bouton cliquable :**
```svelte
<!-- Avant -->
<span class="issue-num">#{issue.number}</span>

<!-- Après -->
<button class="issue-num" onclick={() => openIssue(issue.number)}>
    #{issue.number}
</button>
```

**Haïku au-dessus du header de chaque group-card (si disponible) :**
```svelte
{@const haiku = haikus[group.keyword]}
{#if haiku && !haiku.err}
    <div class="group-haiku">
        <span class="haiku-title">{haiku.title}</span>
        <span class="haiku-desc">{haiku.description}</span>
    </div>
{/if}
```

**Jumeaux dans la liste d'issues :**
```svelte
<!-- Construire un Set des numéros "jumeaux" -->
{@const twinNums = new Set(group.twins.flat())}
{#each group.issues as issue}
    <li class="group-issue" class:is-twin={twinNums.has(issue.number)}>
        <button class="issue-num" onclick={() => openIssue(issue.number)}>
            #{issue.number}
        </button>
        <span class="issue-title">{issue.title}</span>
        {#if twinNums.has(issue.number)}
            <span class="twin-badge" title="Sujet identique">⇔</span>
        {/if}
    </li>
{/each}
```

**Subdivisions (en bas du group-card, avant le footer) :**
```svelte
{#if group.subdivisions.length > 0}
    <details class="group-subdivisions">
        <summary>Subdivisions possibles ({group.subdivisions.length})</summary>
        {#each group.subdivisions as sub}
            <div class="sub-group">
                <span class="sub-keyword">{sub.keyword}</span>
                <span class="sub-count">{sub.issues.length} issues</span>
                <ul class="sub-issues">
                    {#each sub.issues as issue}
                        <li>
                            <button class="issue-num" onclick={() => openIssue(issue.number)}>
                                #{issue.number}
                            </button>
                            {issue.title}
                        </li>
                    {/each}
                </ul>
            </div>
        {/each}
    </details>
{/if}
```

**Groupe "hors-groupes" (après la liste des groupes, avant `{/if}`) :**
```svelte
{#if ungroupedIssues.length > 0}
    <div class="group-card ungrouped-card">
        <div class="group-head">
            <span class="group-keyword ungrouped-kw">hors-groupes</span>
            <span class="group-count">{ungroupedIssues.length} issues</span>
        </div>
        <ul class="group-issues">
            {#each ungroupedIssues as issue}
                <li class="group-issue">
                    <button class="issue-num" onclick={() => openIssue(issue.number)}>
                        #{issue.number}
                    </button>
                    <span class="issue-title">{issue.title}</span>
                </li>
            {/each}
        </ul>
    </div>
{/if}
```

#### 4f. Styles à ajouter

```css
/* Haïku CTA */
.haiku-cta { padding: 0.3rem 0; }
.btn-haiku {
    background: none;
    border: 1px solid #3a2a5a;
    color: #9181f9;
    font-size: 0.62rem;
    padding: 0.2rem 0.7rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
}
.btn-haiku:hover:not(:disabled) { background: #1a1040; }
.btn-haiku:disabled { opacity: 0.4; cursor: default; }

/* Haïku par groupe */
.group-haiku {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    margin-bottom: 0.35rem;
    padding: 0.25rem 0.4rem;
    border-left: 2px solid #4a3a8a;
    background: #0d0a1f;
}
.haiku-title { font-size: 0.68rem; color: #b09af9; font-weight: bold; }
.haiku-desc  { font-size: 0.58rem; color: #888; }

/* issue-num cliquable */
.issue-num {
    background: none;
    border: none;
    padding: 0;
    color: #5a8a5a;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    cursor: pointer;
    flex-shrink: 0;
    min-width: 2.8rem;
    text-align: left;
}
.issue-num:hover { color: #7aba7a; text-decoration: underline; }

/* Jumeaux */
.group-issue.is-twin { background: #0a0a18; border-radius: 2px; }
.twin-badge { font-size: 0.55rem; color: #6a5a9a; margin-left: auto; }

/* Subdivisions */
.group-subdivisions { margin-top: 0.35rem; }
.group-subdivisions summary {
    font-size: 0.58rem;
    color: #777;
    cursor: pointer;
    padding: 0.15rem 0;
}
.sub-group {
    padding: 0.25rem 0.35rem;
    border-left: 1px solid #2a2a4a;
    margin-top: 0.2rem;
}
.sub-keyword {
    font-size: 0.62rem;
    color: #7a6ad9;
    background: #140f30;
    border: 1px solid #3a2a7a;
    border-radius: 3px;
    padding: 0.02rem 0.3rem;
}
.sub-count { font-size: 0.55rem; color: #555; margin-left: 0.3rem; }
.sub-issues {
    list-style: none;
    padding: 0;
    margin: 0.15rem 0 0 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: 0.58rem;
    color: #aaa;
}

/* Hors-groupes */
.ungrouped-card {
    border-color: #2a2a2a;
    opacity: 0.65;
}
.ungrouped-kw {
    color: #777;
    background: #111;
    border-color: #333;
}
```

---

## 5. Vérifications et nettoyage final

### Régressions à vérifier

- [ ] `RoadmapViz.svelte` : consomme `/api/issues/groups` → le champ `groups` est toujours présent, la forme de chaque groupe est rétrocompatible (on ajoute des champs, on n'en retire pas). ✓ Pas de régression.
- [ ] `group-parent/+server.ts` : utilise `issueNumbers` envoyés par le frontend, non impacté.
- [ ] `issue-grouping.ts` : `detectIssueGroups` est aussi appelée en interne pour les subdivisions → risque de récursion infinie à éviter en ne passant **pas** `options` dans l'appel récursif (ou en fixant `minIssues=2` sans aller plus loin).
- [ ] Le groupe "hors-groupes" n'est **pas** passé à la liste `groups` (il est séparé dans `ungroupedIssues`) → le `groupState` ne contient pas de clé "hors-groupes", pas de bouton "Créer issue parente" pour ce groupe.

### Tests manuels

1. Charger la vue Regroupements → vérifier l'apparition du groupe "hors-groupes" avec les 30 issues.
2. Cliquer sur un `#id` → vérifier que la issue s'ouvre dans le panel artefact gauche.
3. Vérifier l'affichage des badges `⇔` sur les groupes qui contiennent des jumeaux.
4. Vérifier l'affichage des `<details>` Subdivisions sur les groupes larges.
5. Cliquer "Générer les haïkus" → attendre la réponse → vérifier l'affichage titre/description sur chaque groupe.
6. Vérifier que le refresh (↻) recharge bien `ungroupedIssues` aussi.

### Ordre d'implémentation recommandé

```
Étape 1 (issue-grouping.ts)   →   types + jumeaux + subdivisions
Étape 2 (+server.ts groups)   →   ungroupedIssues dans la réponse
Étape 3 (haikus route)        →   nouvelle route indépendante
Étape 4 (IssueGroups.svelte)  →   tout le reste UI (toutes les sous-étapes)
```
