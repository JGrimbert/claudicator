# Plan — Issue #182 : Stacks d'issues

_Généré le 2026-03-24_

---

## 1. Analyse du problème

Trois points distincts à traiter :

### 1.1 Bug : haïkus non fonctionnels
L'endpoint `POST /api/issues/groups/haikus` utilise `new Anthropic()` (SDK direct, requiert
`ANTHROPIC_API_KEY`). Le projet fonctionne avec le compte Claude.ai sans API key → les
appels SDK échouent silencieusement et `haikus` reste vide.

De plus, la fonction `generateHaikus()` (IssueGroups.svelte:123) n'envoie que les
**groupes de premier niveau** — les subdivisions ne sont jamais incluses dans la requête.

Enfin, les haïkus devraient s'afficher **inline** (sur la même ligne que le badge mot-clé)
pour groupes ET sous-groupes, pas uniquement dans un bloc séparé pré-header.

### 1.2 Feature : prompt "Plan stack" sur un sous-groupe
Aucun bouton d'action n'existe sur les `tree-branch` (subdivisions) dans `IssueGroups.svelte`.
Il faut pouvoir déclencher depuis un sous-groupe un prompt `/useAtlas` qui produit :
- une réflexion globale harmonieuse sur l'ensemble des issues
- N étapes / N commits autonomes (un par issue)
- pour chaque commit : le diff précis anticipé (fichiers, nature du changement)

Le plan généré doit être conservé dans `.agent/tasks/`.

### 1.3 Feature : visuel "stack-box" pour les sous-groupes
Les subdivisions sont actuellement rendues en arborescence textuelle (`tree-branch`).
Il faut un conteneur visuel (bordure en pointillés colorée + padding) qui engloble
physiquement les issues d'un sous-groupe, comme une "pile" identifiable dans l'UI.

---

## 2. Localisation des usages

| Fichier | Rôle impacté |
|---|---|
| `src/lib/components/IssueGroups.svelte` | generateHaikus(), affichage inline, tree-branch, bouton stack |
| `src/routes/api/issues/groups/haikus/+server.ts` | Remplacer Anthropic SDK → Claude CLI |
| `src/routes/api/issues/groups/stack-plan/+server.ts` | **À créer** — endpoint stack prompt |
| `src/lib/server/services/tasks.ts` | getTasksDir() — pour sauvegarder le plan stack |

Le pattern de spawn CLI de référence est : `src/routes/api/agent/run/+server.ts`
(spawn + `--output-format stream-json` + stdin pour le prompt).

---

## 3. Stratégie de remplacement

### Haïkus : abandon du SDK Anthropic
Remplacer `new Anthropic()` par un spawn `claude -p --dangerously-skip-permissions`
avec prompt en stdin — identique au pattern utilisé dans `agent/run/+server.ts`.
Avantage : cohérence, pas d'API key requise, même authentification que le reste du projet.

L'appel reste parallèle (`Promise.all`) pour ne pas sérialiser les N groupes.
Utiliser `spawn` + promesse au lieu de `execFileSync` pour ne pas bloquer l'event loop.

### Haïkus : extension aux subdivisions
Fusionner groupes et subdivisions dans une seule liste plate envoyée à l'API.
Le backend retourne `haikus: Record<keyword, {title, description} | {err}>` — la même
structure fonctionne pour les deux niveaux car les keywords sont distincts.
Côté template, accéder à `haikus[sub.keyword]` sur chaque `tree-branch-head`.

### Stack prompt : nouvelle route isolée
Créer `src/routes/api/issues/groups/stack-plan/+server.ts` — route synchrone (pas SSE)
qui construit le prompt, spawne Claude, capture stdout, sauvegarde le plan et retourne
`{ planFile, content }`. Garder simple : pas de streaming pour l'instant, réponse JSON.

### UI stacks : CSS + HTML minimal
Remplacer `div.group-tree` par `div.stack-group` contenant des `div.stack-box` (une
par subdivision). Bordure dashed, hue rotatif calculé depuis `subIdx % 6 * 60` (HSL).
Le CSS est entièrement local à `IssueGroups.svelte`, pas de dépendance externe.

---

## 4. Étapes de modification du code

### Étape A — Corriger l'endpoint haïku (patch de `haikus/+server.ts`)

```diff
- import Anthropic from "@anthropic-ai/sdk";
+ import { spawn } from "child_process";

- const client = new Anthropic();

  // Pour chaque groupe (groups + subdivisions fusionnés) :
- const message = await client.messages.create({
-     model: "claude-haiku-4-5-20251001",
-     max_tokens: 256,
-     messages: [{ role: "user", content: prompt }]
- });
- const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";
+ const raw = await spawnClaude(prompt);   // helper interne (voir ci-dessous)
```

**Helper `spawnClaude(prompt)`** : spawn `claude -p --dangerously-skip-permissions`,
écrire le prompt sur stdin, collecter stdout jusqu'à `close`, rejeter sur code ≠ 0.
Supprimer `ANTHROPIC_API_KEY` et `CLAUDECODE` de l'env hérité (pattern existant).

Accepter dans le body : `{ groups: [...], subdivisions: [...] }` et traiter
`[...groups, ...subdivisions]` dans un seul `Promise.all`.

### Étape B — Modifier `generateHaikus()` dans IssueGroups.svelte

```diff
  body: JSON.stringify({
      groups: groups.map(g => ({
          keyword: g.keyword,
          keywords: g.keywords,
          issueTitles: g.issues.map(i => i.title)
-     }))
+     })),
+     subdivisions: groups.flatMap(g =>
+         (g.subdivisions ?? []).map(sub => ({
+             keyword: sub.keyword,
+             keywords: sub.keywords,
+             issueTitles: sub.issues.map(i => i.title)
+         }))
+     )
  })
```

### Étape C — Affichage inline des haïkus (IssueGroups.svelte, template)

Sur la `group-head` (ligne du groupe) :
```svelte
<span class="group-keyword">{group.keyword}</span>
{#if haiku?.title}
    <span class="group-haiku-inline">{haiku.title}</span>
{/if}
```

Sur la `tree-branch-head` (ligne du sous-groupe) :
```svelte
{@const subHaiku = haikus[sub.keyword]}
<span class="sub-keyword">{sub.keyword}</span>
{#if subHaiku?.title}
    <span class="sub-haiku-inline">{subHaiku.title}</span>
{/if}
```

Garder le bloc `group-haiku` existant (description longue) mais le déplacer en tooltip
ou en zone dépliable — éviter la duplication visuelle titre / description au même endroit.

CSS à ajouter :
```css
.group-haiku-inline {
    font-size: 0.55rem;
    color: #7a6ab9;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 12rem;
}
.sub-haiku-inline {
    font-size: 0.52rem;
    color: #5a5a9a;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 10rem;
}
```

### Étape D — Visuel stack-box pour les sous-groupes (IssueGroups.svelte)

Remplacer dans le template la section `{#if (group.subdivisions ?? []).length > 0}` :

```diff
- <div class="group-tree">
-     {#each group.subdivisions as sub}
-         <div class="tree-branch">
+ <div class="stack-group">
+     {#each group.subdivisions as sub, subIdx}
+         <div class="stack-box" style="--stack-hue: {(subIdx * 60) % 360}">
              <!-- contenu tree-branch-head et sub-issues inchangé -->
          </div>
      {/each}
      <!-- residual issues : sans stack-box, conservé tel quel -->
- </div>
+ </div>
```

CSS à ajouter :
```css
.stack-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0.2rem 0 0.35rem 0;
}
.stack-box {
    border: 1px dashed hsl(calc(var(--stack-hue) * 1deg), 28%, 32%);
    border-radius: 4px;
    padding: 0.3rem 0.5rem 0.25rem;
    background: transparent;
}
.stack-box:hover {
    border-color: hsl(calc(var(--stack-hue) * 1deg), 38%, 42%);
}
```

### Étape E — Bouton "Plan stack" sur chaque sous-groupe (IssueGroups.svelte)

Dans `<script>`, ajouter :
```ts
let stackPlanning: Record<string, boolean> = $state({});
let stackFeedback: Record<string, string>  = $state({});

async function launchStackPlan(
    sub: { keyword: string; issues: { number: number; title: string }[] },
    parentKeyword: string
) {
    const key = `${parentKeyword}::${sub.keyword}`;
    stackPlanning = { ...stackPlanning, [key]: true };
    stackFeedback = { ...stackFeedback, [key]: "" };
    try {
        const r = await fetch("/api/issues/groups/stack-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keyword: sub.keyword, parentKeyword, issues: sub.issues })
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        stackFeedback = { ...stackFeedback, [key]: `✓ ${data.planFile}` };
    } catch (e) {
        stackFeedback = { ...stackFeedback, [key]: e instanceof Error ? e.message : String(e) };
    } finally {
        stackPlanning = { ...stackPlanning, [key]: false };
    }
}
```

Dans le template, dans `tree-branch-head` (ou dans `stack-box` juste après) :
```svelte
<button
    class="btn-stack-plan"
    onclick={() => launchStackPlan(sub, group.keyword)}
    disabled={stackPlanning[`${group.keyword}::${sub.keyword}`]}
    title="Générer un plan stack /useAtlas pour ce sous-groupe"
>
    {stackPlanning[`${group.keyword}::${sub.keyword}`] ? "…" : "⚡"}
</button>
{#if stackFeedback[`${group.keyword}::${sub.keyword}`]}
    <span class="stack-feedback">{stackFeedback[`${group.keyword}::${sub.keyword}`]}</span>
{/if}
```

CSS :
```css
.btn-stack-plan {
    background: none;
    border: none;
    color: #5a6a9a;
    font-size: 0.65rem;
    cursor: pointer;
    padding: 0 0.2rem;
    line-height: 1;
    flex-shrink: 0;
}
.btn-stack-plan:hover:not(:disabled) { color: #8a9af9; }
.btn-stack-plan:disabled { opacity: 0.4; cursor: default; }
.stack-feedback { font-size: 0.52rem; color: #7a9a7a; }
```

### Étape F — Créer l'endpoint `stack-plan`

**Fichier** : `src/routes/api/issues/groups/stack-plan/+server.ts`

Corps :
1. Parser `{ keyword, parentKeyword, issues }` depuis le body
2. Construire le prompt (voir template ci-dessous)
3. Spawner `claude -p --dangerously-skip-permissions`, prompt en stdin
4. Collecter stdout, extraire le texte de la réponse
5. Sauvegarder dans `getTasksDir()/stack-{keyword}-{Date.now()}.plan.md`
6. Retourner `json({ planFile, content })`

**Template du prompt stack** :
```
useAtlas

# TASK : Plan stack — sous-groupe "{keyword}" (parent : "{parentKeyword}")

## Issues à traiter ({N} issues → {N} commits autonomes)
{liste : "- #N — Titre"}

## OBJECTIF
Produire un plan en {N} étapes pour implémenter ces issues de façon cohérente.
Commencer par une réflexion globale (dépendances, ordre optimal, risques partagés).
Puis, pour chaque issue, définir un commit indépendant avec le diff précis attendu.

## FORMAT DE RÉPONSE

### Réflexion globale
[Analyse des dépendances, ordre recommandé, points de couplage]

### Étape 1 — Issue #{N1} : {Titre}
- **Commit** : "type(scope): message"
- **Fichiers touchés** : liste
- **Diff attendu** : description précise (ajouts, suppressions, refactors)
- **Prérequis** : (si applicable)

[répéter pour chaque issue]
```

---

## 5. Vérifications et nettoyage final

### Risques de régression

| Risque | Mitigation |
|---|---|
| Collision de keywords entre groupe et sous-groupe | Peu probable (subdivisions plus spécifiques). Si conflit : préfixer la clé : `"sub::${sub.keyword}"` |
| Spawn `claude` parallèle pour N groupes+subdivisions | Limiter à 6 spawns simultanés max (cap dans `Promise.all` avec un pool) |
| `hsl(calc(...))` non supporté sur anciens navigateurs | Tester sur Chrome/Firefox récents. Fallback : `border-color: #3a2a5a` si `--stack-hue` absent |
| Le haïku inline tronque les titres longs | `text-overflow: ellipsis` + `max-width` — acceptable |
| `launchStackPlan` timeout si plan trop long | Ajouter un timeout de 120s sur le spawn, retourner une erreur explicite |

### Tests manuels
1. Ouvrir l'onglet "groupes" dans AgentConsole → cliquer "Générer les haïkus"
   - Vérifier : haïku inline visible sur chaque groupe
   - Vérifier : haïku inline visible sur chaque subdivision (tree-branch-head)
2. Vérifier la bordure pointillée colorée sur chaque `stack-box`
3. Cliquer "⚡" sur un sous-groupe → vérifier que `.agent/tasks/stack-*.plan.md` est créé
4. Vérifier que cliquer sur un numéro d'issue `#N` dans une stack-box fonctionne toujours

### Nettoyage
- Supprimer l'import `Anthropic` et la dépendance `@anthropic-ai/sdk` de `haikus/+server.ts`
  (vérifier qu'aucun autre endpoint du même dossier ne l'importe)
- Vérifier que `getTasksDir()` crée bien le dossier si absent (déjà géré dans `savePlan`)
- Retirer le bloc `group-haiku` séparé (ou le convertir en zone dépliable) pour éviter
  la duplication avec le haïku inline — décision à valider avec l'utilisateur
