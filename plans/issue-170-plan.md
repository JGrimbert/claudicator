Laisse-moi lire les fichiers clés pour bien comprendre la structure actuelle avant de rédiger le plan.
Laisse-moi lire le fichier roadmap réel pour comprendre le format des jalons sans issues.
Bon, j'ai maintenant une compréhension claire du code. Voici le plan détaillé avec toutes les ambiguïtés identifiées.

---

## Plan : Réorganisation de l'onglet "étapes" (roadmap avec beaucoup d'issues)

---

### 1. Analyse du problème

**Problème 1 — Jalons sans issues affichés**

`parseGroups()` dans `agent.ts:166-186` filtre déjà les groupes sans ligne `Issues :` formelle (condition `issues.length > 0`). Donc si le user voit des steps sans chips avant le step 40, deux hypothèses :

- **Hypothèse A** : Le roadmap du projet 126-issues utilise un format où les tickets sont mentionnés *inline* dans `Résumé :` ou le corps du texte, sans la ligne `Issues :` → la regex ne les attrape pas, donc `issues = []` et ils sont filtrés. **Mais le user dit qu'ils SONT visibles** — ce qui est contradictoire avec le filtre actuel.

- **Hypothèse B** : Il existe une autre source/format de roadmap (ex. un roadmap généré avec une version ancienne du prompt, qui utilisait `Steps :` ou ne listait pas les issues explicitement), et le code de parsing a été modifié depuis. Ces groupes seraient des artefacts d'un ancien format.

> **Ambiguïté 1** : Le fichier roadmap avec 126 steps n'est pas accessible dans ce dépôt (c'est le projet lolve). **Peux-tu coller ici 5-10 lignes des premiers groupes de ce fichier** (les jalons sans #id) pour confirmer leur format exact ?

---

**Problème 2 — Issue affichée plusieurs fois**

`planGroupsWithInvalidations` est directement itéré dans l'onglet "étapes". Si `#11` apparaît dans `group.issues` de plusieurs groupes, il est rendu autant de fois. Aucune logique de déduplication inter-groupes n'existe actuellement.

---

### 2. Localisation des usages

| Fichier | Ligne | Rôle | Impact |
|---|---|---|---|
| `src/lib/stores/agent.ts` | 166–186 | `parseGroups()` — extraction issues par groupe | Extraction inline à ajouter |
| `src/lib/stores/agent.ts` | 188 | `planGroups` derived | Ajouter filtre post-extraction |
| `src/lib/stores/agent.ts` | 194–200 | `planGroupsWithInvalidations` | Étendre pour déduplication |
| `src/lib/components/PlanPanel.svelte` | 831–891 | Onglet "étapes" — liste des groups | Utiliser `displayIssues` |
| `src/lib/components/PlanPanel.svelte` | 582–692 | Onglet "étape" — détail d'un groupe | Afficher issues "dupliquées" grisées |
| `src/lib/components/PlanPanel.svelte` | 167–193 | `createGroupTasks()` | Conserver sur `allIssues` ou `displayIssues` ? |
| `src/lib/components/PlanPanel.svelte` | 213–238 | `reprocessGroup()` | Inchangé — opère sur `allIssues` |

---

### 3. Stratégie

#### A. `parseGroups` — Extraction inline des issues (pour les jalons)

Si après tentative de match formel (`Issues : #NNN`) le groupe a `issues = []`, scanner tout le bloc à la recherche de `#NNN` :

```diff
- if (issues.length > 0)
-     groups.push({ ... });
+ const inlineIssues = issues.length === 0
+     ? [...block.matchAll(/#(\d+)/g)].map(m => parseInt(m[1]))
+     : [];
+ const allIssues = [...new Set([...issues, ...inlineIssues])];
+ if (allIssues.length > 0)
+     groups.push({ ..., issues: allIssues });
```

> **Ambiguïté 2** : Doit-on exclure certaines zones du scan inline ? Par exemple `Dépend de : Groupe 1` ne devrait pas être scanné (mais ce format de dépendance utilise des noms de groupe, pas des `#NNN`). A priori, scanner tout le bloc est sûr — **confirme ?**

---

#### B. Nouveau type et store — déduplication inter-groupes

Dans `agent.ts`, ajouter un type étendu et un derived store :

```typescript
export type PlanGroupDeduped = PlanGroupWithInvalidations & {
    displayIssues: number[];  // issues à afficher dans ce step
    hiddenIssues: number[];   // issues déjà affichées dans un step précédent
};

export const planGroupsDeduped = derived(
    planGroupsWithInvalidations,
    ($groups) => {
        const seen = new Set<number>();
        const result: PlanGroupDeduped[] = [];
        for (const g of $groups) {
            const displayIssues = g.issues.filter(n => !seen.has(n));
            displayIssues.forEach(n => seen.add(n));
            const hiddenIssues = g.issues.filter(n => !displayIssues.includes(n));
            // Filtrer les groupes entièrement vides après déduplication
            if (displayIssues.length > 0) {
                result.push({ ...g, displayIssues, hiddenIssues });
            }
        }
        return result;
    }
);
```

> **Ambiguïté 3** : Un groupe dont **toutes les issues sont déjà affichées dans des steps précédents** — que faire ?
> - Option A : **Le masquer** (filtre `displayIssues.length > 0`) — liste plus courte
> - Option B : **Le garder** avec un libellé "aucune nouvelle issue" → montre la structure du roadmap même si redondant
>
> **Quelle option préfères-tu ?**

---

#### C. Mise à jour de l'onglet "étapes" (`PlanPanel.svelte`)

- Importer `planGroupsDeduped` au lieu de `planGroupsWithInvalidations`
- Dans le `{#each}` : afficher `group.displayIssues` pour les chips
- Garder `group.issues` pour `createGroupTasks` et `reprocessGroup` (opèrent sur toutes les issues)

> **Ambiguïté 4** : `createGroupTasks` crée des tasks pour chaque issue du groupe. Si `#11` est dans le groupe 5 (premier step) ET dans le groupe 12 — la task est créée au step 5. Quand on appuie sur "＋ task" dans le step 12, doit-on :
> - A) Ignorer les issues déjà taskées (`displayIssues` seulement)
> - B) Créer pour toutes (`allIssues`) mais laisser le serveur gérer les doublons (comportement actuel — "alreadyExisted")
>
> **Comportement B est déjà géré, donc probablement OK. Confirme ?**

---

#### D. Onglet "étape" (détail d'un groupe sélectionné)

Dans le détail du groupe (`activeGroup`), afficher toutes les issues en distinguant :
- `displayIssues` → chips normaux
- `hiddenIssues` → chips grisés avec tooltip "déjà assignée au step N" (nécessite de connaître l'index du premier step — à calculer lors de la construction du store)

> **Ambiguïté 5** : Veux-tu afficher les `hiddenIssues` dans le détail du step, ou les masquer complètement également ?

---

### 4. Étapes de modification du code

1. **`agent.ts`** : Modifier `parseGroups` — extraction inline fallback
2. **`agent.ts`** : Ajouter type `PlanGroupDeduped` + store `planGroupsDeduped`
3. **`PlanPanel.svelte`** : Onglet "étapes" — switcher vers `planGroupsDeduped`, render `displayIssues`
4. **`PlanPanel.svelte`** : Onglet "étape" — afficher `hiddenIssues` si souhaité (selon réponse ambiguité 5)
5. **Vérification** : `createGroupTasks`, `reprocessGroup`, `autoReprocessDoneGroups` restent sur `group.issues`

---

### 5. Vérifications et nettoyage

- `planGroupsWithInvalidations` reste exporté (utilisé par `hasInvalidatedSlots`, `autoReprocessDoneGroups`) — ne pas le supprimer
- Le graphe DAG (mermaid, roadmap-viz) utilise-t-il `planGroups` ou `planGroupsWithInvalidations` ? Si oui → le laisser intact, la déduplication n'affecte que l'affichage
- Régresssion : un groupe avec `issues: [11, 22]` qui devient `displayIssues: [22]` (11 déjà vu) — `createGroupTasks` doit toujours créer les 2, pas seulement 22

---

**Avant de démarrer l'implémentation**, je dois lever les ambiguïtés 1, 3 et 5. Les autres (2, 4) ont des réponses probables mais méritent confirmation :

| # | Question | Réponse probable |
|---|---|---|
| 1 | Format des jalons sans `#id` dans le fichier 126-steps | — besoin d'un extrait |
| 2 | Scanner tout le bloc pour inline ? | Oui, sûr |
| 3 | Groupes entièrement vides → masquer ou garder ? | **À décider** |
| 4 | `createGroupTasks` sur `allIssues` ou `displayIssues` ? | `allIssues` (comportement actuel OK) |
| 5 | Afficher `hiddenIssues` grisés dans détail du step ? | **À décider** |