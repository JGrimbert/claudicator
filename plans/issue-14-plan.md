Maintenant j'ai une vision claire. Voici le plan détaillé :
---
# Plan : Affichage des tokens Claude
## 1. Analyse du problème
**Situation actuelle :**
- Claude est invoqué via `claude -p --dangerously-skip-permissions` (CLI, mode texte brut)
- Le stdout est lu ligne par ligne et émis via SSE → pas de tokens dans ce format
- `Task.logs` stocke le texte brut, sans aucune métadonnée de consommation
- Un TODO existe déjà dans `+page.svelte:224-229` qui identifie ce besoin
**Problème central :** Le mode `-p` sans flag de format ne retourne pas les token counts. Il faut ajouter `--output-format stream-json` pour obtenir un flux JSONL structuré qui inclut les tokens en fin de session, tout en conservant le streaming SSE.
**Deux niveaux à implémenter :**
1. **Tokens par task** — capturés à chaque run, persistés dans le `.json` de la task
2. **Tokens globaux projet** — cumul de tous les runs de toutes les tasks + futures opérations
---
## 2. Localisation des usages
### Fichiers impactés
| Fichier | Rôle actuel | Modification |
|---|---|---|
| `src/routes/api/agent/run/+server.ts` | Spawn Claude, SSE | Ajouter `--output-format stream-json`, parser JSONL, extraire usage |
| `src/lib/server/services/tasks.ts` | Interface `Task` + CRUD | Étendre `Task` avec `usage?` et `totalUsage?` ; étendre `updateTask` |
| `src/lib/components/RunConsole.svelte` | Affichage console SSE | Recevoir event `type: "usage"`, afficher compteur en fin de run |
| `src/lib/components/TaskList.svelte` | Liste des tasks | Afficher tokens par task si présents |
| `src/routes/+page.svelte` | Page principale | Afficher total global, supprimer les TODOs |
### Nouveau fichier à créer
| Fichier | Rôle |
|---|---|
| `src/lib/server/services/usage.ts` | Compteur global projet (`.agent/usage.json`) |
| `src/routes/api/usage/+server.ts` | Route GET pour lire le total global |
---
## 3. Stratégie de remplacement
### Flag `--output-format stream-json`
Au lieu du stdout texte brut actuel, Claude Code CLI émet du JSONL (une ligne JSON par chunk) :
```jsonl
{"type":"assistant","message":{"content":[{"type":"text","text":"Voici mon analyse..."}]},"session_id":"abc"}
{"type":"result","subtype":"success","cost_usd":0.012,"usage":{"input_tokens":1234,"output_tokens":567},"session_id":"abc"}
```
- Lignes `type: "assistant"` → extraire `.message.content[].text` → émettre via SSE comme aujourd'hui
- Ligne `type: "result"` → extraire `.usage` → émettre un event SSE spécial `type: "usage"` + persister
**Fallback :** si une ligne ne parse pas en JSON valide → l'émettre comme texte brut (rétrocompatibilité)
**Risque :** le format exact peut varier selon la version du CLI. Un test préalable avec `claude --version` et un run de contrôle est nécessaire avant implémentation.
---
## 4. Étapes de modification du code
### Étape 1 — Étendre `Task` et `updateTask`
**Fichier :** `src/lib/server/services/tasks.ts`
Ajouter un type `TokenUsage` et deux champs optionnels à `Task` :
```typescript
export type TokenUsage = {
    inputTokens: number;
    outputTokens: number;
};
export type Task = {
    id: string;
    title: string;
    status: TaskStatus;
    issueNumber?: number;
    branch?: string;
    logs: string[];
    usage?: TokenUsage;       // tokens du dernier run
    totalUsage?: TokenUsage;  // tokens cumulés (tous runs)
    createdAt: string;
    updatedAt: string;
};
```
Étendre la signature de `updateTask` pour accepter `usage` et `totalUsage` dans le patch.
Les anciennes tasks sans ces champs restent valides (champs optionnels → pas de migration nécessaire).
---
### Étape 2 — Créer `src/lib/server/services/usage.ts`
Service de compteur global stocké dans `.agent/usage.json` :
```typescript
type ProjectUsage = {
    totalInputTokens: number;
    totalOutputTokens: number;
    lastUpdated: string;
};
export function getProjectUsage(): ProjectUsage
export function addProjectUsage(input: number, output: number): void
```
Ce service sera appelé à chaque fin de run réussi depuis `run/+server.ts`.
---
### Étape 3 — Modifier `src/routes/api/agent/run/+server.ts`
1. Ajouter `"--output-format", "stream-json"` dans le tableau d'args du `spawn`
2. Dans `proc.stdout.on("data")` : tenter de parser chaque ligne en JSON
   - `type === "assistant"` → extraire le texte du content, émettre via SSE `type: "agent"`
   - `type === "result"` → extraire `usage`, émettre via SSE `type: "usage"`, stocker dans `capturedUsage`
   - Fallback : ligne non-JSON → émettre telle quelle comme `type: "agent"`
3. Dans `proc.on("close")` (code 0) :
   - Appeler `updateTask(taskId, { status: "done", logs: allLogs, usage: capturedUsage, totalUsage: ... })`
   - Appeler `addProjectUsage(capturedUsage.inputTokens, capturedUsage.outputTokens)`
---
### Étape 4 — Créer `src/routes/api/usage/+server.ts`
Route simple :
```typescript
GET → retourne getProjectUsage()
```
---
### Étape 5 — Modifier `src/lib/components/RunConsole.svelte`
- Dans le handler SSE, détecter `type === "usage"` :
  - Ne pas ajouter dans les logs affichés
  - Stocker localement pour affichage
- En bas de la console, afficher en fin de run :
```
Tokens : 1 234 envoyés · 567 reçus
```
---
### Étape 6 — Modifier `src/lib/components/TaskList.svelte`
- Si `task.usage` est présent, afficher sous le titre de la task :
```
1.2k / 0.5k tokens
```
Format compact, couleur neutre (ex. `text-slate-400`).
---
### Étape 7 — Modifier `src/routes/+page.svelte`
- Au chargement, appeler `GET /api/usage`
- Afficher dans le header (ou footer) le total global : `Total projet : 45k tokens`
- Supprimer les 4 lignes de TODO correspondantes (lignes 224-229)
---
## 5. Vérifications et nettoyage final
### Tests de non-régression
| Scénario | Vérification |
|---|---|
| Run normal | Les logs SSE s'affichent toujours en temps réel |
| Parsing JSON | Si une ligne n'est pas du JSON valide, elle est émise comme texte brut |
| Anciennes tasks | Tasks existantes sans champ `usage` s'affichent sans erreur |
| Run interrompu | Si le process est tué (code ≠ 0), aucun token n'est enregistré dans la task ni dans le global |
| Runs multiples | `totalUsage` dans la task s'accumule correctement |
| Compteur global | `.agent/usage.json` s'incrémente après chaque run réussi |
### Vérifications préalables à l'implémentation
1. **Version CLI** : exécuter `claude --version` et vérifier que `--output-format stream-json` est supporté
2. **Format JSONL** : faire un run test (`claude -p --output-format stream-json` avec un prompt simple) et examiner la sortie stdout pour valider le schéma exact des objets JSON
3. **Champ `usage`** : confirmer la présence et le nom exact des champs (`input_tokens` / `output_tokens` vs `inputTokens` / `outputTokens`)
### Gitignore
S'assurer que `.agent/usage.json` est dans `.gitignore` (données locales, non versionnées).
### Nettoyage final
- Supprimer les TODOs de `+page.svelte` lignes 224-229 une fois la fonctionnalité implémentée
---
Veux-tu que je sauvegarde ce plan dans `plans/` ou que je passe directement à l'implémentation d'une étape ?