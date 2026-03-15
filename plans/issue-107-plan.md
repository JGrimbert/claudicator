Voici le plan détaillé.

---

# Plan — Session de console persistante

## 1. Analyse du problème

**Problème central** : `RunConsole.svelte` est rendu conditionnellement dans le panneau principal de `+page.svelte` :

```svelte
{#if $agentRunState.taskId !== null}
    <RunConsole />
{:else}
    <AgentConsole />
{/if}
```

Quand l'utilisateur change de tâche, de vue ou de tab, `RunConsole` est **démonté**. Si l'`EventSource` SSE est géré à l'intérieur du composant (cycle de vie `onMount`/`onDestroy`), la connexion est **coupée**. La session Claude dans `claude-session.ts` reste vivante côté serveur, mais le client ne reçoit plus les événements.

**Conséquences** :
- Perte du stream de logs en cours
- Impossibilité de voir la progression si l'utilisateur navigue
- L'`EventSource` est recréé au remontage → peut rater des événements

**Objectif** : Le stream SSE doit survivre aux changements UI. La console devient une **tâche de fond** persistante, visible via un onglet fixe `° console` en bas à droite.

---

## 2. Localisation des usages

### Fichiers impactés

| Fichier | Rôle actuel | Impact |
|---|---|---|
| `src/lib/stores/agent.ts` | Stocke `agentRunState` (logs, running, sessionAlive) | Ajouter gestion de l'EventSource + état minimisé |
| `src/lib/components/RunConsole.svelte` | Gère l'EventSource SSE + affichage + actions | Extraire la gestion SSE vers le store |
| `src/routes/+page.svelte` | Monte RunConsole conditionnellement | Supprimer le rendu conditionnel de RunConsole |
| `src/routes/+layout.svelte` | Layout racine | Ajouter le composant `ConsoleDrawer` toujours monté |

### Localisation clé dans `RunConsole.svelte`

L'`EventSource` est probablement créé dans un bloc `onMount` ou `$effect` de `RunConsole.svelte`, lié au cycle de vie du composant. C'est ce couplage qu'il faut **briser**.

---

## 3. Stratégie de remplacement

**Principe** : séparer la **réception des données** (SSE) de l'**affichage** (composant).

```
AVANT :
  RunConsole.svelte
  └── crée EventSource
  └── gère les logs
  └── affiche les logs
  └── démonté → EventSource fermé

APRÈS :
  sessionStore (store Svelte)
  └── crée EventSource (lifecycle indépendant)
  └── accumule les logs dans le store
  └── survit aux changements de composants

  ConsoleDrawer.svelte (nouveau, dans +layout.svelte)
  └── lit les logs depuis le store
  └── affiché en overlay fixe bas-droite
  └── toujours monté, jamais démonté

  RunConsole.svelte (allégé)
  └── ne fait que lire le store + afficher
  └── peut rester dans le panneau principal (vue développée)
  └── OU être supprimé au profit de ConsoleDrawer
```

**Choix architectural retenu** : Un seul composant `ConsoleDrawer.svelte` en overlay fixe remplace l'usage de `RunConsole.svelte` dans le panneau principal. `RunConsole.svelte` est conservé comme sous-composant interne de `ConsoleDrawer` pour le contenu (logs, spinner, actions).

---

## 4. Étapes de modification du code

### Étape 1 — Enrichir le store `agent.ts`

Ajouter dans `src/lib/stores/agent.ts` :

- Un champ `consoleMinimized: boolean` dans `agentRunState` (défaut : `false`)
- Une fonction `startConsoleStream(url: string)` qui :
  - Crée un `EventSource`
  - Parse les événements SSE et les pousse dans `agentRunState.logs`
  - Met à jour `running`, `sessionAlive`
  - Ferme proprement l'EventSource à la fin du stream (event `close` ou `turn_end`)
- Une fonction `stopConsoleStream()` qui ferme l'EventSource
- Une action `toggleConsoleMinimized()` pour ouvrir/fermer le drawer

La référence à l'`EventSource` est stockée dans une variable **module-level** (hors du store), pour que sa durée de vie ne soit pas liée à un composant.

### Étape 2 — Migrer la gestion SSE hors de `RunConsole.svelte`

Dans `RunConsole.svelte` :

- **Supprimer** le code de création/gestion de l'`EventSource`
- **Remplacer** par une lecture directe du store `agentRunState`
- Conserver uniquement l'affichage (logs, spinner, actions) et les appels aux endpoints (`kill`, `session`, `input`)
- Le composant devient **pur** : il affiche ce que le store lui donne

### Étape 3 — Créer `ConsoleDrawer.svelte`

Nouveau fichier `src/lib/components/ConsoleDrawer.svelte` :

**Comportement** :
- Toujours monté dans `+layout.svelte`
- Visible uniquement si `$agentRunState.taskId !== null`
- Position : `fixed`, `bottom: 0`, `right: 1rem` (ou valeur à définir)
- Deux états :
  - **Minimisé** (`consoleMinimized: true`) : affiche seulement l'onglet `° console` avec la loupiotte clignotante
  - **Développé** (`consoleMinimized: false`) : affiche `RunConsole` en overlay flottant

**Structure visuelle de l'onglet** :
```
┌──────────────────┐
│ ● console        │  ← loupiotte CSS animation (pulse)
└──────────────────┘
```
- `●` clignote si `$agentRunState.running === true`
- Clic → toggle `consoleMinimized`

**Overlay développé** :
- `z-index` élevé, largeur fixe (ex: 480px), hauteur max (ex: 60vh)
- Contient `<RunConsole />` (lecture seule du store)
- Bouton × pour minimiser (sans fermer la session)
- Bouton "Fermer" pour terminer la session (si !running && !sessionAlive)

### Étape 4 — Modifier `+layout.svelte`

Ajouter à la fin du body :

```svelte
<ConsoleDrawer />
```

Toujours présent, jamais conditionnel. Le composant gère lui-même sa visibilité via le store.

### Étape 5 — Modifier `+page.svelte`

- **Supprimer** le bloc conditionnel `{#if $agentRunState.taskId !== null} <RunConsole /> {/if}`
- **Laisser** `<AgentConsole />` (diagrammes/preview) dans le panneau principal, ou adapter selon le besoin
- La console n'est **plus dans le flux de mise en page** — elle vit dans l'overlay

### Étape 6 — Fermeture automatique par l'app

Dans `src/hooks.server.ts`, `destroyAllSessions()` est déjà appelé au redémarrage. Côté client, ajouter dans le store un handler sur l'événement `beforeunload` de la fenêtre :

```typescript
window.addEventListener('beforeunload', () => stopConsoleStream());
```

Et dans le stream SSE, quand la connexion se ferme (fin de session côté serveur), le store :
1. Met `running = false`, `sessionAlive = false`
2. Ferme l'EventSource
3. Ne démonte pas `ConsoleDrawer` (il attend que l'utilisateur ferme manuellement)

### Étape 7 — Gestion de la loupiotte CSS

Dans `ConsoleDrawer.svelte`, animation CSS pure :

```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.2; }
}

.indicator {
  animation: pulse 1.8s ease-in-out infinite;
}
```

Active uniquement quand `$agentRunState.running === true`. Quand idle (session vivante mais inactive), la loupiotte est **fixe** (pas d'animation ou animation plus lente).

---

## 5. Vérifications et nettoyage final

### Régressions à vérifier

| Scénario | Vérification |
|---|---|
| Lancement d'un plan (phase one-shot) | L'EventSource de la phase plan fonctionne toujours (chemin `processes.ts`) |
| Lancement d'une implémentation | `startConsoleStream()` crée le stream, `ConsoleDrawer` apparaît |
| Navigation vers une autre tâche pendant un run | Le stream continue, les logs s'accumulent dans le store |
| Rechargement de page (`F5`) | `hooks.server.ts` reset les tasks "running" → "failed", store réinitialisé |
| Fermeture de session via bouton | `DELETE /api/agent/session` + `stopConsoleStream()` + store reset |
| Interruption via bouton | `POST /api/agent/kill` + `stopConsoleStream()` + task → failed |
| Plusieurs tâches en parallèle | Une seule session active à la fois (`isSessionBusy` côté serveur) |
| Redémarrage serveur | `destroyAllSessions()` côté serveur, `ConsoleDrawer` disparaît si store vide |

### Nettoyage

- Vérifier qu'il n'y a **plus de référence** à la gestion SSE dans `RunConsole.svelte`
- Vérifier qu'aucun `EventSource` n'est créé hors du store
- Supprimer les imports `RunConsole` de `+page.svelte` s'ils ne sont plus utilisés
- Vérifier que la `GlobalInputBar` (réponse interactive / follow-up) utilise toujours le store correctement
- Tester le `z-index` du drawer pour qu'il ne masque pas les modales/menus

---

## Résumé des fichiers à modifier

| Fichier | Action |
|---|---|
| `src/lib/stores/agent.ts` | Ajouter gestion EventSource + `consoleMinimized` + `startConsoleStream` / `stopConsoleStream` |
| `src/lib/components/RunConsole.svelte` | Retirer gestion SSE, ne garder que l'affichage/actions |
| `src/lib/components/ConsoleDrawer.svelte` | **Créer** — overlay fixe, onglet + contenu |
| `src/routes/+layout.svelte` | Ajouter `<ConsoleDrawer />` |
| `src/routes/+page.svelte` | Retirer rendu conditionnel de RunConsole |