# Plan : Persistance plan complet + onglet + skill

## 1. Analyse du problème

Trois fonctionnalités distinctes mais liées :

### A. Persistance du plan complet
**Problème** : le plan `.md` est sauvegardé sur disque (`.agent/tasks/stack-full-<keyword>-<ts>.plan.md`),
mais les métadonnées (keyword, sous-stacks, statut) ne sont pas persistées.
`fullStackState` dans `IssueGroups.svelte` est un état local Svelte → perdu au refresh de fenêtre.

### B. Onglet "plan complet"
**Problème** : les onglets du panel central (`dag`, `plan`, `cluster`, `coal`) n'incluent pas de tab
pour afficher le plan complet. Aucun composant dédié n'existe. Aucun store global ne référence le
plan complet courant.

### C. Skill `/plan-complet`
**Problème** : seul `useAtlas.md` existe dans `.claude/commands/`. Pas de skill pour la génération
de plan complet depuis un GROUPE.

---

## 2. Localisation des usages

| Fichier | Rôle actuel | Modification requise |
|---|---|---|
| `src/routes/api/issues/groups/stack-plan-full/+server.ts` | Génère + sauvegarde `.plan.md` | Créer JSON de métadonnées, émettre `planId` |
| `src/lib/components/IssueGroups.svelte:171` | `planFullStack()` — état local | Alimenter le store global `activeFullPlan` |
| `src/routes/+page.svelte:16,393-398` | `midTabs`, `activeMiddleTab` | Ajouter tab `fullplan`, auto-basculer |
| `src/routes/+page.svelte:451-474` | Template onglets centre | Ajouter branche `{:else if tab === 'fullplan'}` |
| `src/lib/stores/agent.ts` | Stores globaux | Ajouter `activeFullPlan` |
| `.agent/tasks/` | Stockage actuel | Nouveau dossier `.agent/full-plans/` |
| `.claude/commands/` | Skills Claude | Ajouter `plan-complet.md` |

---

## 3. Stratégie

### Nouvelle structure de données

```typescript
// src/lib/server/services/fullPlans.ts
type FullPlanStatus = "generating" | "done" | "error";

type FullPlan = {
  id: string;                // "stack-full-<keyword>-<ts>"
  keyword: string;
  status: FullPlanStatus;
  planFile?: string;         // nom du .plan.md dans .agent/tasks/
  subStacks: { keyword: string; issues: { number: number; title: string }[] }[];
  residualIssues?: { number: number; title: string }[];
  createdAt: number;
  updatedAt: number;
};
```

Stocké dans `.agent/full-plans/<id>.json`.

### Nouveau store Svelte

```typescript
// dans agent.ts
export const activeFullPlan = writable<{
  id: string;
  keyword: string;
  status: "generating" | "done" | "error";
  planFile?: string;
} | null>(null);
```

### Logique de reprise après refresh

Au `onMount` de `+page.svelte` : fetch `/api/issues/groups/full-plans` → charger le plan le plus
récent dans `activeFullPlan`. Si son statut JSON est `"generating"` → le remettre à `"error"`
(processus interrompu au refresh). Analogue à ce que fait `hooks.server.ts` pour les tasks.

---

## 4. Étapes de modification du code

### Étape 1 — Créer `src/lib/server/services/fullPlans.ts`

Fonctions à exposer :

```typescript
getFullPlansDir(): string         // ".agent/full-plans/"
createFullPlan(data): FullPlan    // écrit <id>.json, retourne FullPlan
updateFullPlan(id, patch): void   // lit + merge + réécrit <id>.json
getFullPlan(id): FullPlan | null  // lit <id>.json
listFullPlans(): FullPlan[]       // lit tous .json, trie par createdAt desc
getLatestFullPlan(): FullPlan | null
```

Structure des fichiers :
- `.agent/full-plans/` — nouveau dossier (créer avec `fs.mkdirSync` au premier appel)
- `.agent/full-plans/stack-full-<keyword>-<ts>.json`

---

### Étape 2 — Créer `GET /api/issues/groups/full-plans/+server.ts`

Route simple qui retourne `listFullPlans()`.

```typescript
// GET /api/issues/groups/full-plans
export const GET: RequestHandler = async () => {
    return json(listFullPlans());
};
```

---

### Étape 3 — Modifier `stack-plan-full/+server.ts`

**Ajouts :**

1. Au début du handler (avant le spawn) :
   ```typescript
   const planId = `stack-full-${groupKeyword}-${Date.now()}`;
   createFullPlan({ id: planId, keyword: groupKeyword, status: "generating", subStacks, residualIssues, ... });
   ```

2. Dans `start(controller)`, envoyer le `planId` en premier event SSE :
   ```typescript
   send({ type: "system", line: "[planId]", planId });
   ```

3. Sur `proc.on("close")` — après l'écriture du `.plan.md` :
   ```typescript
   updateFullPlan(planId, { status: "done", planFile, updatedAt: Date.now() });
   ```

4. Sur `proc.on("error")` :
   ```typescript
   updateFullPlan(planId, { status: "error", updatedAt: Date.now() });
   ```

---

### Étape 4 — Modifier `src/lib/stores/agent.ts`

Ajouter le store global (après les déclarations existantes) :

```typescript
export const activeFullPlan = writable<{
  id: string;
  keyword: string;
  status: "generating" | "done" | "error";
  planFile?: string;
} | null>(null);
```

---

### Étape 5 — Modifier `IssueGroups.svelte`

Dans `planFullStack()` :

1. Importer `activeFullPlan` depuis le store.

2. Dès le début de la fonction, mettre `activeFullPlan` en generating :
   ```typescript
   activeFullPlan.set({ id: "", keyword: group.keyword, status: "generating" });
   ```

3. Dans le callback `onEvent` du stream, intercepter l'event `[planId]` :
   ```typescript
   onEvent: (event: any) => {
       if (event.type === "system" && event.line === "[planId]" && event.planId) {
           activeFullPlan.update(s => s ? { ...s, id: event.planId } : s);
       }
       if (event.type === "system" && event.line === "[done]" && event.planFile) {
           fullStackState = { ...fullStackState, [key]: { planning: false, feedback: event.planFile } };
           activeFullPlan.update(s => s ? { ...s, status: "done", planFile: event.planFile } : s);
       }
   },
   ```

4. Dans le `catch` : `activeFullPlan.update(s => s ? { ...s, status: "error" } : s);`

---

### Étape 6 — Modifier `src/routes/+page.svelte`

**Script :**

```typescript
import { ..., activeFullPlan } from "$lib/stores/agent";

// Étendre le type
let activeMiddleTab: "dag" | "plan" | "cluster" | "coal" | "fullplan" = "dag";

// Auto-basculer vers fullplan quand le plan est terminé
$: if ($activeFullPlan?.status === "done") activeMiddleTab = "fullplan";

// Dans midTabs — ajouter après coal :
$: midTabs = [
    { id: 'dag',     label: 'dag'     },
    { id: 'plan',    label: 'plan'    },
    ...($clusterFocusedSymbol ? [{ id: 'cluster', label: 'cluster' }] : []),
    ...($coalCodeFocus ? [{ id: 'coal', label: '#' + $coalCodeFocus.issueNum }] : []),
    ...($activeFullPlan ? [{ id: 'fullplan', label: 'plan complet' }] : []),
];

// Dans onMount — charger le dernier plan complet :
onMount(async () => {
    loadProjectUsage();
    // ... (localStorage splits existants) ...

    // Restaurer le dernier plan complet
    try {
        const r = await fetch("/api/issues/groups/full-plans");
        if (r.ok) {
            const plans = await r.json();
            if (plans.length > 0) {
                const latest = plans[0];
                // Si "generating" au moment du refresh → marquer error
                activeFullPlan.set({
                    ...latest,
                    status: latest.status === "generating" ? "error" : latest.status,
                });
            }
        }
    } catch { /* silencieux */ }
});
```

**Template — ajouter dans le `{#snippet children(tab)}` :**

```svelte
{:else if tab === 'fullplan'}
    {#if $activeFullPlan}
        <FullPlanView plan={$activeFullPlan} />
    {:else}
        <div class="plan-placeholder"><span>Aucun plan complet disponible</span></div>
    {/if}
```

**Import :**

```typescript
import FullPlanView from "$lib/components/FullPlanView.svelte";
```

---

### Étape 7 — Créer `src/lib/components/FullPlanView.svelte`

Composant qui :
- Reçoit `plan: { id, keyword, status, planFile? }` en prop
- Si `status === "generating"` → affiche spinner + message "Génération en cours…"
- Si `status === "error"` → affiche message d'erreur
- Si `status === "done" && planFile` → fetch le contenu du fichier + affiche le markdown

Pour la lecture : créer `GET /api/issues/groups/full-plans/[id]/content/+server.ts` qui lit
`.agent/tasks/<planFile>` et le retourne en texte brut.

Affichage : `<pre class="plan-md">{content}</pre>` avec style monospace scrollable.

Structure minimale :
```svelte
<script lang="ts">
    let { plan } = $props<{ plan: { id: string; keyword: string; status: string; planFile?: string } }>();
    let content = $state("");

    $effect(() => {
        if (plan.status === "done" && plan.planFile) {
            fetch(`/api/issues/groups/full-plans/${plan.id}/content`)
                .then(r => r.text())
                .then(t => content = t);
        }
    });
</script>

{#if plan.status === "generating"}
    <div class="fp-loading">Génération en cours…</div>
{:else if plan.status === "error"}
    <div class="fp-error">Erreur — le plan n'a pas été généré correctement.</div>
{:else if content}
    <pre class="fp-content">{content}</pre>
{/if}
```

---

### Étape 8 — Créer `GET /api/issues/groups/full-plans/[id]/content/+server.ts`

```typescript
// Lit .agent/tasks/<planFile> et retourne le contenu texte
export const GET: RequestHandler = async ({ params }) => {
    const plan = getFullPlan(params.id);
    if (!plan || !plan.planFile) throw error(404, "Plan non trouvé");
    const filePath = path.join(getTasksDir(), plan.planFile);
    if (!fs.existsSync(filePath)) throw error(404, "Fichier plan introuvable");
    const content = fs.readFileSync(filePath, "utf-8");
    return new Response(content, { headers: { "Content-Type": "text/plain" } });
};
```

---

### Étape 9 — Créer `.claude/commands/plan-complet.md`

Skill en dur pour la création de plan complet. Voir section dédiée ci-dessous.

---

## 5. Vérifications et nettoyage final

### Régressions à vérifier

1. **`fullStackState` local dans IssueGroups** : ne pas supprimer — il gère le feedback bouton par
   bouton (spinner + texte). L'enrichir avec la mise à jour du store global, pas le remplacer.

2. **Multiple plans complets** : `listFullPlans()` retourne tous les plans triés par date. `activeFullPlan`
   affiche toujours le plus récent. Si l'utilisateur génère un deuxième plan complet, `activeFullPlan`
   est remplacé et l'onglet bascule automatiquement. Les anciens plans restent sur disque.

3. **Race condition SSE** : le `planId` est envoyé en premier event SSE. Si la connexion SSE est lente,
   `activeFullPlan.id` peut rester vide momentanément. Vérifier que l'event `[done]` arrive toujours
   après `[planId]` (c'est garanti par l'ordre du code serveur).

4. **Route `/api/tasks/[id]/plan` vs nouvelle route** : les plans complets ne sont PAS des tasks
   standard — leur `id` ne correspond pas à un fichier `.agent/tasks/<id>.json`. Utiliser la nouvelle
   route dédiée `/api/issues/groups/full-plans/[id]/content`.

5. **`hooks.server.ts`** : déjà gère la réinitialisation des tasks "running" → "failed" au démarrage.
   La logique analogue pour les full plans est dans le `onMount` côté client (simpler car pas besoin
   d'un hook serveur).

### Ordre d'implémentation recommandé

```
1. fullPlans.ts (service)
2. GET /api/issues/groups/full-plans
3. GET /api/issues/groups/full-plans/[id]/content
4. Modifier stack-plan-full/+server.ts
5. Modifier agent.ts (store)
6. Modifier IssueGroups.svelte
7. Créer FullPlanView.svelte
8. Modifier +page.svelte
9. Créer .claude/commands/plan-complet.md
```

---

## Skill `.claude/commands/plan-complet.md`

Contenu du fichier à créer :

```markdown
# Skill : Création d'un plan complet de groupe

Ce skill est invoqué quand l'utilisateur demande un plan complet pour un GROUPE d'issues.

## Protocole

1. **Identifier le groupe** — lire le keyword principal et les sous-stacks
2. **Analyser les dépendances** — quelles issues se bloquent mutuellement ?
3. **Définir l'ordre** — des stacks indépendantes aux stacks dépendantes
4. **Pour chaque sous-stack** : ordre logique, un commit par issue, diff précis attendu

## Format de sortie obligatoire

### Vue d'ensemble
(dépendances inter-stacks, ordre d'implémentation global, risques)

**Dépendances inter-stacks :**
- Stack "X" et stack "Y" sont indépendantes — ordre libre
- #N et #M sont liés : #N est la base

**Infrastructure existante (déjà en place) :**
- (lister ce qui ne doit pas être réimplémenté)

**Risques :**
- (points d'attention)

**Ordre recommandé :** stack "A" en premier puis stack "B"

---

### Stack "<keyword>" (N issues)

#### Étape 1 — #<num> : <titre>
- **Commit :** `type(scope): description`
- **Fichiers touchés :** `src/...`
- **Diff attendu :**
  ```diff
  - ancien code
  + nouveau code
  ```

#### Étape 2 — ...

---

### Résiduel

#### #<num> : <titre>
- Traitement : (description ou "placeholder à clarifier")

## Contraintes

- NE PAS commiter, NE PAS pousser, NE PAS modifier de fichiers
- Produire uniquement un plan textuel structuré
- Chaque étape doit être implémentable indépendamment
- Les diffs doivent être précis (pas de pseudocode)
```
