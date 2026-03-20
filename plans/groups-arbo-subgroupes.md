# Plan — Arbo subgroupes (onglet GROUPES)

## 1. Analyse du problème

**État actuel :**
- Les subdivisions sont cachées derrière un `<details>` rétractable intitulé "Subdivisions possibles (N)" — `IssueGroups.svelte:250-270`
- Les issues des subdivisions sont aussi listées dans la `<ul>` plate du groupe parent → duplication visuelle
- Pas de tri préférentiel : groupes avec et sans subdivisions sont mélangés
- Présentation plate (cartes empilées), pas de hiérarchie visuelle
- Pas de déduplication inter-subdivisions : une issue peut apparaître dans la subdivision A et la subdivision B du même groupe

**Comportement attendu :**
1. Arborescence : groupe → branches (subdivisions) → feuilles (issues)
2. Groupes ayant des subdivisions triés en premier dans la liste
3. Issues affichées directement sous leur branche (toujours déroulées, pas de `<details>`)
4. Déduplication stricte : une issue déjà affichée dans une subdivision précédente est retirée des suivantes
5. Si une subdivision tombe à < 2 issues après déduplication → supprimée ; ses issues restantes passent en résiduel
6. Supprimer le `<details>` "Subdivisions possibles(N)"

---

## 2. Localisation des usages

### Fichiers à modifier

| Fichier | Lignes concernées | Rôle |
|---|---|---|
| `src/lib/components/IssueGroups.svelte` | 210–300 (template) + 250–270 (bloc subdivisions) + styles | Affichage principal |
| `src/lib/server/agent/issue-grouping.ts` | 266–289 (calcul subdivisions) | Logique serveur |

### Fichiers non concernés

- `src/routes/api/issues/groups/+server.ts` — retourne déjà les bonnes données
- `src/routes/api/issues/group-parent/+server.ts` — inchangé
- `src/routes/api/issues/groups/haikus/+server.ts` — inchangé

---

## 3. Stratégie de remplacement

### A. Côté serveur — `issue-grouping.ts` (ajout mineur)

Appliquer une **déduplication inter-subdivisions** dans la boucle de calcul des subdivisions (ligne 266) :

1. Trier les `subs` détectées par taille décroissante (la plus large prime)
2. Parcourir les subs dans l'ordre, maintenir un `Set<number> assignedNums`
3. Pour chaque sub :
   - Filtrer ses issues : exclure celles déjà dans `assignedNums`
   - Si issues restantes < 2 → ne pas inclure cette sub (ses issues passent en résiduel implicitement)
   - Sinon → inclure la sub filtrée, ajouter ses issues à `assignedNums`

Cela garantit que les données retournées par l'API sont déjà propres (pas de chevauchement).

### B. Côté front — `IssueGroups.svelte` (refactoring affichage)

1. **Tri des groupes** : calculer `sortedGroups` = groupes avec subdivisions d'abord, puis sans
2. **Remplacer** le `{#each groups …}` par `{#each sortedGroups …}`
3. **Bifurcation dans le template** selon la présence de subdivisions :
   - **Groupe avec subdivisions** → rendu arborescent (branches + résiduel)
   - **Groupe sans subdivision** → rendu actuel conservé (liste plate)
4. **Supprimer** le bloc `<details class="group-subdivisions">` (lignes 250–270)
5. **Supprimer** la `<ul class="group-issues">` pour les groupes avec subdivisions (évite duplication)

---

## 4. Étapes de modification du code

### Étape 1 — `issue-grouping.ts` : déduplication inter-subdivisions

**Emplacement :** après la ligne 281 (`const subs = detectIssueGroups(uniqueIssues, { minIssues: 2 });`)

Remplacer le `.map()` final (lignes 283–288) par :
```typescript
const assignedNums = new Set<number>();
const dedupedSubs: typeof subs = [];
for (const sub of subs.sort((a, b) => b.issues.length - a.issues.length)) {
    const filtered = sub.issues.filter(i => !assignedNums.has(i.number));
    if (filtered.length < 2) continue;
    dedupedSubs.push({ ...sub, issues: filtered });
    for (const i of filtered) assignedNums.add(i.number);
}
group.subdivisions = dedupedSubs
    .filter(sub =>
        sub.issues.length < group.issues.length &&
        sub.issues.every(i => parentNums.has(i.number))
    )
    .map(sub => ({ keyword: sub.keyword, keywords: sub.keywords, issues: sub.issues }));
```

### Étape 2 — `IssueGroups.svelte` : tri des groupes

Dans le bloc `<script>`, après la déclaration `let groups`, ajouter :
```typescript
const sortedGroups = $derived([
    ...groups.filter(g => (g.subdivisions ?? []).length > 0),
    ...groups.filter(g => (g.subdivisions ?? []).length === 0),
]);
```

### Étape 3 — `IssueGroups.svelte` : remplacer `{#each groups …}` par `{#each sortedGroups …}`

Ligne 212 : `{#each groups as group (group.keyword)}` → `{#each sortedGroups as group (group.keyword)}`

### Étape 4 — `IssueGroups.svelte` : refactoriser le bloc issues/subdivisions

Remplacer les lignes 236–270 (bloc `<ul class="group-issues">` + bloc `<details>`) par :

```svelte
{#if (group.subdivisions ?? []).length > 0}
    {@const assignedNums = new Set(group.subdivisions.flatMap(s => s.issues.map(i => i.number)))}
    {@const residualIssues = group.issues.filter(i => !assignedNums.has(i.number))}
    <div class="group-tree">
        {#each group.subdivisions as sub, idx}
            {@const isLast = idx === group.subdivisions.length - 1 && residualIssues.length === 0}
            <div class="tree-branch">
                <div class="tree-branch-head">
                    <span class="branch-connector">{isLast ? '└─' : '├─'}</span>
                    <span class="sub-keyword">{sub.keyword}</span>
                    {#if sub.keywords.length > 1}
                        <span class="sub-extra-kw">+{sub.keywords.slice(1).join(', ')}</span>
                    {/if}
                    <span class="sub-count">{sub.issues.length}</span>
                </div>
                <ul class="sub-issues">
                    {#each sub.issues as issue}
                        <li class="tree-leaf" class:is-twin={twinNums.has(issue.number)}>
                            <span class="leaf-pipe">│  </span>
                            <button class="issue-num" onclick={() => openIssue(issue.number)}>
                                #{issue.number}
                            </button>
                            <span class="issue-title">{issue.title}</span>
                            {#if twinNums.has(issue.number)}
                                <span class="twin-badge" title="Sujet identique">⇔</span>
                            {/if}
                        </li>
                    {/each}
                </ul>
            </div>
        {/each}
        {#if residualIssues.length > 0}
            <ul class="group-residual">
                {#each residualIssues as issue}
                    <li class="tree-leaf" class:is-twin={twinNums.has(issue.number)}>
                        <span class="leaf-connector">└─</span>
                        <button class="issue-num" onclick={() => openIssue(issue.number)}>
                            #{issue.number}
                        </button>
                        <span class="issue-title">{issue.title}</span>
                        {#if twinNums.has(issue.number)}
                            <span class="twin-badge" title="Sujet identique">⇔</span>
                        {/if}
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
{:else}
    <!-- Rendu actuel conservé pour groupes sans subdivisions -->
    <ul class="group-issues">
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
    </ul>
{/if}
```

### Étape 5 — `IssueGroups.svelte` : styles CSS

**Supprimer** les classes obsolètes :
- `.group-subdivisions` (le `<details>`)
- `.sub-group`

**Ajouter** les nouvelles classes :
```css
.group-tree {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0.2rem 0 0.2rem 0.4rem;
    font-family: 'JetBrains Mono', monospace;
}
.tree-branch {
    display: flex;
    flex-direction: column;
}
.tree-branch-head {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.1rem 0;
    color: var(--text-muted, #888);
}
.branch-connector {
    color: var(--border, #444);
    flex-shrink: 0;
}
.sub-keyword {
    font-weight: 600;
    color: var(--accent, #7eb8f7);
    font-size: 0.62rem;
    text-transform: lowercase;
}
.sub-extra-kw {
    color: var(--text-muted, #666);
    font-size: 0.58rem;
}
.sub-count {
    color: var(--text-muted, #555);
    font-size: 0.58rem;
}
.sub-issues {
    list-style: none;
    padding: 0;
    margin: 0;
}
.tree-leaf {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    padding: 0.08rem 0;
}
.leaf-pipe {
    color: var(--border, #444);
    flex-shrink: 0;
    white-space: pre;
    font-size: 0.6rem;
}
.leaf-connector {
    color: var(--border, #444);
    flex-shrink: 0;
    font-size: 0.6rem;
}
.group-residual {
    list-style: none;
    padding: 0;
    margin: 0.1rem 0 0 0;
}
```

---

## 5. Vérifications et nettoyage final

### Cas à tester manuellement

| Cas | Attendu |
|---|---|
| Groupe sans subdivision | Rendu identique à avant (liste plate) |
| Groupe avec 2 subdivisions sans chevauchement | 2 branches visibles, issues déroulées |
| Groupe avec 2 subdivisions avec chevauchement | Après dédup, issues communes dans la première branche seulement |
| Subdivision réduite à 1 issue après dédup | Supprimée ; issue 1 passe en résiduel |
| Haïkus | S'affichent toujours au-dessus du group-head |
| Bouton "Créer issue parente" | Utilise `group.issues` (toutes les issues) — non affecté |
| Badge jumeaux | `twinNums` calculé sur `group.twins` — visible dans les branches et le résiduel |
| Tri | Groupes avec subdivisions systématiquement avant groupes sans |

### Régressions à vérifier

- `stats` (groupCount, issuesInGroups, etc.) : calculées côté API, non affectées
- `ungroupedClusters` et `ungroupedIssues` : rendu inchangé (lignes 301–347)
- `generateHaikus()` : itère sur `groups` (pas `sortedGroups`) — OK, les haïkus sont indexés par `group.keyword`
- `groupState` : initialisé sur `groups`, accédé par `group.keyword` — pas affecté par le tri

### Nettoyage

- Supprimer les classes CSS `.group-subdivisions` et `.sub-group` dans `<style>`
- Vérifier qu'aucune autre référence à `group-subdivisions` n'existe dans le projet
