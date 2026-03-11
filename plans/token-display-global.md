# Plan global — Affichage des tokens (issue tokens)

## 1. Analyse du problème

### Situation actuelle

Les tokens sont **capturés correctement** côté serveur via le CLI Claude Code (`obj.type === "result"`, `obj.usage`) et stockés dans deux champs de la task :

- `task.usage` — tokens du **dernier run** uniquement
- `task.totalUsage` — tokens **cumulés** (tous runs depuis la création)

L'affichage est aujourd'hui **fragmenté** et **non-unifié** :

| Endroit | Ce qui est affiché | Limite |
|---|---|---|
| `RunConsole.svelte` barre basse | Tokens du run terminé (input/output) | Disparaît à la fermeture de la console |
| `TaskList.svelte` label ligne | `impl. · 12.3k` tokens cumulés | Discret, pas le détail par phase |
| `TaskList.svelte` inline-meta | `Xk / Yk tok` cumulé ou dernier run | Formatage ambigu, pas de séparation plan/impl |

### Problèmes à résoudre

1. **Pas de distinction par phase** : impossible de savoir combien la planification a coûté vs l'implémentation.
2. **Pas de composant réutilisable** : la `usage-bar` de RunConsole est dupliquée et non partagée.
3. **Enrichissement de contexte invisible** : `loadMethodSnippets()` et `generateAtlasStrings()` (atlas lolve-carto) sont appelés dans `run/+server.ts` mais leurs stats ne sont jamais transmises à l'UI.
4. **Pas d'affichage persistant par phase** : une fois la console fermée, les tokens de la session disparaissent de la vue.

---

## 2. Localisation des usages

### Fichiers à modifier

| Fichier | Rôle | Modification nécessaire |
|---|---|---|
| `src/lib/server/services/tasks.ts` | Type `Task` + `updateTask` | Ajouter `planUsage`, `implUsage` |
| `src/routes/api/agent/run/+server.ts` | Spawn Claude, capture tokens, SSE | Émettre event `context`, sauvegarder par phase |
| `src/lib/components/RunConsole.svelte` | Console temps réel | Remplacer `usage-bar` par composant unifié |
| `src/lib/components/TaskList.svelte` | Liste + panels workflow | Intégrer composant unifié dans panels plan/impl |

### Fichier à créer

| Fichier | Rôle |
|---|---|
| `src/lib/components/PromptUsage.svelte` | Composant unifié tokens + contexte atlas |

### Écrans de prompt concernés

1. **Scène principale — Planification** : déclenchée via AgentInput/RunConsole, sans `plan` dans la requête
2. **Panel "implement" — Implémentation** : `clickImplement()` dans TaskList.svelte, avec `plan` fourni

---

## 3. Stratégie de remplacement

### Principe : évolution non-breaking

- Les champs `usage` et `totalUsage` sont **conservés** (pas de migration nécessaire pour les tasks existantes).
- Les nouveaux champs `planUsage` et `implUsage` sont **optionnels** — les tasks existantes continuent à fonctionner.
- Le composant `PromptUsage.svelte` remplace le bloc `usage-bar` dans RunConsole et est ajouté dans TaskList.

### Composant `PromptUsage.svelte`

Props :
```ts
usage?: TokenUsage          // tokens de la session (dernier run)
totalUsage?: TokenUsage     // tokens cumulés (tous runs)
context?: {                 // enrichissement de contexte
  methods: number           // nombre de méthodes chargées
  hasAtlas: boolean         // atlas lolve-carto présent
}
label?: string              // ex: "Plan" | "Implémentation" | "Tokens"
```

Rendu visuel :
```
[Plan]  4 500 envoyés · 1 200 reçus   [atlas ✓  12 méthodes]
                              Total cumulé : 18.4k / 4.3k
```

### Transmission des stats de contexte via SSE

Dans `run/+server.ts`, émettre en début de run un event SSE de type `"context"` :

```json
{ "type": "context", "methods": 14, "hasAtlas": true }
```

Cet event est capturé dans RunConsole (et potentiellement TaskList) pour alimenter `PromptUsage`.

---

## 4. Étapes de modification du code

### Étape A — Étendre `Task` dans `tasks.ts`

**Fichier :** `src/lib/server/services/tasks.ts`

1. Ajouter dans le type `Task` :
   ```ts
   planUsage?: TokenUsage;   // tokens phase planification
   implUsage?: TokenUsage;   // tokens phase implémentation
   ```

2. Étendre le patch de `updateTask` pour accepter ces champs :
   ```ts
   patch: Partial<Pick<Task,
     "status" | "logs" | "branch" | "pushed" |
     "usage" | "totalUsage" | "planUsage" | "implUsage"
   >>
   ```

---

### Étape B — Enrichir `run/+server.ts`

**Fichier :** `src/routes/api/agent/run/+server.ts`

1. **Capturer les stats d'enrichissement** (dans la branche `isImplementationPhase`) :
   ```ts
   // Après generateAtlasStrings() et loadMethodSnippets()
   const contextStats = {
     methods: methods?.length ?? 0,
     hasAtlas: !!(atlas?.trim()),
   };
   ```

2. **Émettre un event SSE `"context"`** juste avant de lancer Claude :
   ```ts
   emit(JSON.stringify(contextStats), "context");
   ```

3. **Sauvegarder par phase** dans le handler `close` (succès) :
   ```ts
   if (isImplementationPhase) {
     updateTask(taskId, { status, logs: allLogs, usage: capturedUsage, totalUsage, implUsage: capturedUsage });
   } else {
     updateTask(taskId, { status, logs: allLogs, usage: capturedUsage, totalUsage, planUsage: capturedUsage });
   }
   ```

---

### Étape C — Créer `PromptUsage.svelte`

**Fichier :** `src/lib/components/PromptUsage.svelte` *(nouveau)*

Composant Svelte affichant :
- Label de phase (optionnel)
- Tokens de la session (`usage`) : input · output, formatés avec `toLocaleString("fr-FR")`
- Cumul total (`totalUsage`) si différent du session (i.e. plusieurs runs)
- Indicateur de contexte atlas : nombre de méthodes + présence atlas

Styles cohérents avec le design système existant (fond `#07070f`, police `JetBrains Mono`, couleurs `#4a4a6a`).

---

### Étape D — Refactorer `RunConsole.svelte`

**Fichier :** `src/lib/components/RunConsole.svelte`

1. Remplacer le bloc `usage-bar` (lignes 139–147) par :
   ```svelte
   {#if !$agentRunState.running && lastUsage}
     <PromptUsage usage={lastUsage} context={lastContext} />
   {/if}
   ```

2. Ajouter la gestion de l'event SSE `"context"` dans le store ou via un `$:` réactif :
   ```ts
   $: lastContext = (() => {
     const ctxLogs = $agentRunState.logs.filter(l => l.type === 'context');
     if (!ctxLogs.length) return undefined;
     try { return JSON.parse(ctxLogs[ctxLogs.length - 1].line); }
     catch { return undefined; }
   })();
   ```

3. Mettre à jour le filtre `visibleLogs` pour exclure aussi les events `"context"`.

4. Ajouter `"context"` comme type dans `RunLog` (dans `src/lib/stores/agent.ts` si nécessaire).

---

### Étape E — Intégrer dans `TaskList.svelte`

**Fichier :** `src/lib/components/TaskList.svelte`

1. **Importer `PromptUsage`** en haut du bloc `<script>`.

2. **Ajouter `planUsage` et `implUsage`** au type local `Task` (lignes 8–22).

3. **Remplacer `meta-tag meta-tokens`** (lignes 559–567) par `<PromptUsage>` avec `totalUsage={task.totalUsage ?? task.usage}`.

4. **Panel "plan"** : sous la `plan-scene-hint`, ajouter :
   ```svelte
   {#if task.planUsage}
     <PromptUsage usage={task.planUsage} label="Plan" />
   {/if}
   ```

5. **Panel "implement"** : dans l'`impl-footer`, après le bouton "Lancer l'agent", afficher si `task.implUsage` est présent :
   ```svelte
   {#if task.implUsage}
     <PromptUsage usage={task.implUsage} totalUsage={task.totalUsage} label="Implémentation" />
   {/if}
   ```

---

### Étape F — Store : ajouter le type `"context"`

**Fichier :** `src/lib/stores/agent.ts`

Dans le type `RunLog`, ajouter `"context"` comme valeur possible :
```ts
type RunLog = { line: string; type: "agent" | "system" | "usage" | "context" };
```

---

## 5. Vérifications et nettoyage final

### Vérifications de non-régression

| Scénario | Ce qui doit fonctionner |
|---|---|
| Task existante sans `planUsage`/`implUsage` | Affichage normal, pas d'erreur |
| Run de planification → fermeture console | `task.planUsage` visible dans le panel plan |
| Run d'implémentation → fermeture console | `task.implUsage` visible dans panel impl + total cumulé |
| Plusieurs runs successifs | `totalUsage` s'additionne correctement (déjà OK) |
| Run sans atlas disponible | `hasAtlas: false` → indicateur absent ou grisé |
| Interruption du run (kill) | Pas de `planUsage`/`implUsage` sauvegardé (capturedUsage null) |

### Nettoyage

- Supprimer le bloc `usage-bar` CSS + HTML de `RunConsole.svelte` (remplacé par composant)
- Ne pas dupliquer l'affichage : choisir entre `inline-meta` ou panel, pas les deux
- Vérifier que le label `impl. · Xk` dans `rowLabels()` est cohérent avec les nouvelles données

### Points d'attention

- L'event SSE `"context"` doit être **ignoré** dans la planification simple (sans atlas), la branche `!isImplementationPhase` n'appelle pas `generateAtlasStrings` actuellement. À vérifier si on veut aussi tracer le contexte de la planification.
- La planification utilise un prompt brut (`rawPrompt`), pas d'enrichissement atlas actuellement. Il faudra décider si l'on veut l'ajouter ou non.
- Taille du composant : rester minimal, pas de table détaillée, juste les valeurs clés.
