# Plan : Invalidation des issues fermées dans la roadmap

## 1. Analyse du problème

Quand une roadmap est générée, elle regroupe des issues dans des **PlanGroup** (ex: `Issues : #80, #92`).
Si une issue référencée est fermée sur GitHub **après** la génération, elle reste dans le groupe sans signal visuel.

**Comportement cible :**
- Tout slot d'issue fermée dans un groupe = slot **invalidé**
- Un groupe avec slot(s) invalidé(s) → peut être **reprocessé** (les issues fermées sont retirées du groupe)
- Une roadmap avec au moins un slot invalidé → peut être **régénérée**

**Contrainte :** le snapshot actuel (`.agent/analysis-snapshot.json`) ne stocke pas le champ `state` des issues.
Il faut l'enrichir sans casser la rétro-compatibilité.

---

## 2. Localisation des usages

| Fichier | Rôle concerné |
|---|---|
| `src/routes/api/issues/snapshot/+server.ts` | Type `IssueSnapshot` (manque `state`) |
| `src/routes/api/issues/analyze/+server.ts` | Construit `snapshotData` (manque `state`) |
| `src/routes/api/issues/analyze/update/+server.ts` | Met à jour le snapshot (manque `state`) |
| `src/lib/stores/agent.ts` | `PlanGroup`, `parseGroups()`, `planGroups` dérivé |
| `src/lib/components/PlanPanel.svelte` | Affiche groupes + `IssueChip` |
| `src/lib/components/IssueAnalysis.svelte` | Vue roadmap, boutons régénération |
| `src/lib/components/IssueChip.svelte` | Supporte déjà `strikethrough` |

---

## 3. Stratégie

**Phase 1 — Snapshot enrichi** : ajouter `state` dans `IssueSnapshot`
**Phase 2 — Détection côté store** : dériver les slots invalidés par groupe
**Phase 3 — UI PlanPanel** : afficher visuellement les slots invalidés + bouton "Reprocesser"
**Phase 4 — Route API reprocess** : retirer les issues fermées d'un groupe dans le Markdown
**Phase 5 — Bouton régénération globale** : dans `IssueAnalysis`, signaler + offrir régénération

---

## 4. Étapes de modification du code

### Étape 1 — Enrichir `IssueSnapshot` avec `state`

**`src/routes/api/issues/snapshot/+server.ts`**

```diff
-export type IssueSnapshot = { number: number; title: string; updatedAt: string };
+export type IssueSnapshot = { number: number; title: string; updatedAt: string; state?: string };
```

**`src/routes/api/issues/analyze/+server.ts`**

```diff
-snapshotData = raw.map(i => ({ number: i.number, title: i.title, updatedAt: i.updatedAt }));
+snapshotData = raw.map(i => ({ number: i.number, title: i.title, updatedAt: i.updatedAt, state: i.state ?? "open" }));
```

Même diff dans `src/routes/api/issues/analyze/update/+server.ts` si le snapshot y est reconstruit.

---

### Étape 2 — Store `issueStates` + `planGroupsWithInvalidations`

**`src/lib/stores/agent.ts`**

```diff
+export const issueStates = writable<Map<number, string>>(new Map());
```

Nouveau store dérivé :

```diff
+export type PlanGroupWithInvalidations = PlanGroup & { invalidatedIssues: number[] };
+
+export const planGroupsWithInvalidations = derived(
+    [planGroups, issueStates],
+    ([$groups, $states]) => $groups.map(g => ({
+        ...g,
+        invalidatedIssues: g.issues.filter(n => $states.get(n) === "closed")
+    })) as PlanGroupWithInvalidations[]
+);
+
+export const hasInvalidatedSlots = derived(
+    planGroupsWithInvalidations,
+    $groups => $groups.some(g => g.invalidatedIssues.length > 0)
+);
```

Alimenter `issueStates` dans le composant qui charge le snapshot (ex: dans `IssueAnalysis.svelte` au mount) :

```ts
// au mount, après fetch /api/issues/snapshot
const map = new Map<number, string>();
for (const s of snapshot) map.set(s.number, s.state ?? "open");
issueStates.set(map);
```

---

### Étape 3 — Affichage dans `PlanPanel.svelte`

Remplacer `planGroups` par `planGroupsWithInvalidations` :

```diff
-import { planGroups, activePlanGroupIndex, ... } from "$lib/stores/agent";
+import { planGroupsWithInvalidations, hasInvalidatedSlots, activePlanGroupIndex, ... } from "$lib/stores/agent";
```

Sur chaque `IssueChip` dans l'onglet "étapes" / "étape" :

```diff
-<IssueChip number={n} />
+<IssueChip number={n} strikethrough={group.invalidatedIssues.includes(n)} />
```

Ajouter un badge d'alerte sur les groupes invalidés :

```svelte
{#if group.invalidatedIssues.length > 0}
    <span class="invalid-badge" title="Issues fermées dans ce groupe">⚠ {group.invalidatedIssues.length} fermée(s)</span>
    <button onclick={() => reprocessGroup(group.index)}>Reprocesser</button>
{/if}
```

---

### Étape 4 — Route API `POST /api/issues/roadmap/reprocess-group`

Nouveau fichier : `src/routes/api/issues/roadmap/reprocess-group/+server.ts`

**Logique :**
1. Recevoir `{ roadmapId: string | null, groupIndex: number, closedIssues: number[] }`
2. Lire le fichier Markdown correspondant (`.agent/roadmaps/<id>.md` ou `.agent/analysis.md`)
3. Localiser le bloc `### Groupe <groupIndex>`
4. Dans la ligne `Issues : #X, #Y`, retirer les numéros listés dans `closedIssues`
5. Si la ligne `Issues :` devient vide → supprimer tout le bloc du groupe
6. Sauvegarder le fichier
7. Retourner le nouveau contenu Markdown

```ts
export async function POST({ request }) {
    const { roadmapId, groupIndex, closedIssues } = await request.json();
    const filePath = roadmapId
        ? `.agent/roadmaps/${roadmapId}.md`
        : ".agent/analysis.md";

    if (!fs.existsSync(filePath))
        return json({ error: "Fichier introuvable" }, { status: 404 });

    let content = fs.readFileSync(filePath, "utf-8");
    // Regex : trouver la ligne Issues : dans le bon groupe et retirer les numéros fermés
    content = removeClosedFromGroup(content, groupIndex, closedIssues);
    fs.writeFileSync(filePath, content, "utf-8");
    return json({ content });
}
```

Fonction utilitaire `removeClosedFromGroup` :
- Split le contenu en blocs `### Groupe N`
- Dans le bon bloc, regex `Issues\s*:\s*((?:#\d+(?:,\s*)?)+)` → filtrer les numéros fermés
- Si la liste résultante est vide → supprimer tout le bloc

---

### Étape 5 — Bouton "Régénérer" dans `IssueAnalysis.svelte`

```svelte
{#if $hasInvalidatedSlots}
    <div class="invalidation-banner">
        ⚠ Cette roadmap contient des issues fermées.
        <button onclick={triggerRegenerate}>Régénérer la roadmap</button>
    </div>
{/if}
```

`triggerRegenerate` appelle `/api/issues/analyze` (POST existant) avec le `roadmapId` courant, identique au flux déjà en place pour la création de roadmap.

---

### Étape 6 — Mise à jour du store après reprocess

Dans `PlanPanel.svelte`, la fonction `reprocessGroup` :
1. `POST /api/issues/roadmap/reprocess-group` avec les données du groupe
2. En succès → `issueAnalysis.update(s => ({ ...s, result: data.content }))` pour refléter le nouveau Markdown
3. Le store `planGroupsWithInvalidations` se met à jour automatiquement

---

## 5. Vérifications et nettoyage final

### Rétro-compatibilité
- Le champ `state` dans `IssueSnapshot` est optionnel (`state?: string`).
  → Anciens snapshots sans `state` : fallback `state ?? "open"` → aucun slot invalidé affiché par erreur.

### Cas limites
- Groupe dont **toutes** les issues sont fermées → le bloc est supprimé du Markdown après reprocess
- Issue fermée référencée dans **plusieurs** groupes → chaque groupe l'affiche avec strikethrough indépendamment
- Snapshot non chargé encore (chargement async) → `issueStates` vide → aucune invalidation affichée (safe)

### Vérifications fonctionnelles
- [ ] Fermer une issue sur GitHub → rafraîchir le snapshot (`/api/issues/analyze/update`) → slot apparaît en strikethrough
- [ ] Cliquer "Reprocesser" → le groupe est mis à jour dans le Markdown → plus de strikethrough
- [ ] Si le groupe devient vide après reprocess → il disparaît de `planGroups`
- [ ] Cliquer "Régénérer" → re-déclenche une analyse complète → roadmap recalculée depuis GitHub

### Nettoyage
- Ne pas oublier de mettre à jour `IssueSnapshot` dans `update/+server.ts` (même enrichissement `state`)
- Vérifier que `issueStates` est alimenté dans tous les points d'entrée de chargement de snapshot (initial et après update)
