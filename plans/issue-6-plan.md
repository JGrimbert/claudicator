Voici le plan détaillé :
---
# Plan — Animation console (affichage des messages Claude en temps réel)
## 1. Analyse du problème
Claude Code CLI émet deux flux pendant son exécution :
- **stdout** → résultat final (le plan, le code…)
- **stderr** → messages de progression ("Loading tools…", "Thinking…", indicateurs ANSI…)
Le serveur capture déjà ces deux flux ligne par ligne et les envoie en SSE (`type: "agent"` pour stdout, `type: "system"` pour stderr). Mais côté client, `RunConsole.svelte` n'affiche le contenu que lorsque `visibleLogs.length > 0`.
Le problème est double :
1. **Les messages stderr contiennent des séquences ANSI** (codes de couleur, de curseur) → ils arrivent dans le navigateur sous forme de caractères illisibles ou sont ignorés
2. **La condition d'affichage dans RunConsole.svelte** ne montre rien tant qu'aucun log `visibleLogs` n'est présent, ce qui masque les messages système préliminaires
---
## 2. Localisation des usages
| Fichier | Responsabilité concernée |
|---|---|
| `src/routes/api/agent/run/+server.ts` | Capture stdout/stderr, buffering ligne par ligne, émission SSE |
| `src/lib/components/RunConsole.svelte` | Affichage des logs, condition `visibleLogs.length === 0` |
| `src/lib/components/TaskList.svelte` | Consommation du stream SSE, peuplement de `agentRunState.logs` |
---
## 3. Stratégie de remplacement
**Approche retenue : strip ANSI côté serveur + affichage immédiat des messages système côté client**
- Ajouter un nettoyage des séquences ANSI sur chaque ligne stderr avant émission SSE
- Modifier RunConsole pour afficher les messages `type: "system"` **même avant** que les messages `type: "agent"` arrivent
- Distinguer visuellement les messages système (statut/progression) des messages agent (sortie Claude)
**Alternative rejetée** : simuler des messages côté client (timer) → ne reflète pas l'état réel du process.
---
## 4. Étapes de modification du code
### Étape 1 — Strip ANSI dans `+server.ts`
Dans `src/routes/api/agent/run/+server.ts`, ajouter une fonction de nettoyage :
```diff
+ function stripAnsi(str: string): string {
+   return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').replace(/\x1B\][^\x07]*\x07/g, '').trim();
+ }
```
Appliquer ce strip sur chaque ligne **stderr** avant d'émettre l'événement SSE :
```diff
- const line = buffer.trim();
+ const line = stripAnsi(buffer.trim());
  if (line) send({ line, type: 'system' });
```
### Étape 2 — Filtrer les lignes vides/parasites côté serveur
Dans le même fichier, ignorer les lignes système qui ne contiennent que des caractères de contrôle ou qui sont vides après strip :
```diff
+ if (!line || line.length < 2) continue;
  send({ line, type: 'system' });
```
### Étape 3 — Modifier `RunConsole.svelte` pour afficher les messages système immédiatement
Actuellement, la condition `visibleLogs.length === 0` masque tout. Il faut séparer :
- `systemLogs` = messages `type: "system"` (progression, statuts)
- `agentLogs` = messages `type: "agent"` (sortie Claude)
```diff
- $: visibleLogs = $agentRunState.logs.filter(l => !/^\[pid:\d+\]/.test(l.line));
+ $: systemLogs = $agentRunState.logs.filter(l => l.type === 'system' && !/^\[pid:\d+\]/.test(l.line));
+ $: agentLogs  = $agentRunState.logs.filter(l => l.type === 'agent');
+ $: visibleLogs = $agentRunState.logs.filter(l => !/^\[pid:\d+\]/.test(l.line));
```
### Étape 4 — Afficher les messages système dans une zone dédiée
Dans le template de `RunConsole.svelte`, remplacer la condition actuelle :
```diff
- {#if $agentRunState.running && visibleLogs.length === 0}
-   <span class="hint blink">{FRAMES[frame]} En attente de la première sortie…</span>
- {/if}
+ {#if $agentRunState.running && agentLogs.length === 0}
+   {#if systemLogs.length > 0}
+     <span class="hint status">{FRAMES[frame]} {systemLogs[systemLogs.length - 1].line}</span>
+   {:else}
+     <span class="hint blink">{FRAMES[frame]} En attente de la première sortie…</span>
+   {/if}
+ {/if}
```
Cela affiche le **dernier message système reçu** (ex: "Loading tools…", "Thinking…") à la place du message fixe, avec le spinner braille animé.
### Étape 5 — Style CSS pour le message de statut
Ajouter dans le `<style>` de `RunConsole.svelte` :
```css
.hint.status {
  color: #4a9eff;
  font-style: italic;
  font-size: 0.7rem;
  opacity: 0.75;
}
```
---
## 5. Vérifications et nettoyage final
| Vérification | Méthode |
|---|---|
| Les séquences ANSI sont bien supprimées | Logger côté serveur les lignes brutes avant/après strip |
| Le message de statut s'affiche pendant la phase de réflexion | Tester en lançant une tâche et observer l'affichage |
| Les messages agent s'affichent toujours normalement | Vérifier que `agentLogs` peuple bien la liste principale |
| Pas de régression sur le filtre `[pid:\d+]` | Vérifier que la ligne PID ne s'affiche pas dans les deux zones |
| Les messages système ne persistent pas après la fin | Vérifier que `systemLogs` disparaît / ne pollue pas l'historique |
**Régression à surveiller** : si Claude émet des messages stderr très fréquents (ex: un par token), la zone de statut clignoterait trop vite → envisager un debounce côté client (mettre à jour l'affichage statut max toutes les 200ms).