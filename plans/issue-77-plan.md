Je vais d'abord lire le plan complet pour connaître les identités cibles, puis explorer la structure des fichiers.
Je vais lire les premières lignes de tous les fichiers en parallèle pour vérifier l'état actuel.
Maintenant je lis les endpoints en parallèle.
Tous les fichiers sont sans commentaire de module. Je vais ajouter les commentaires JSDoc en parallèle, en commençant par les services.
Services done. Maintenant les endpoints Tâches et Agent en parallèle.
Cartographie en parallèle.
GitHub/Issues en parallèle.
Domaines restants en parallèle.
Toutes les modifications sont effectuées. Récapitulatif de ce qui a été fait :

**Étape 1 — Services `lib/server/` (7 fichiers)** ✅
- `services/claude.ts` → `/** Claude CLI — exécute un prompt via le CLI claude (POST) */`
- `services/git.ts` → `/** Git — opérations sur le dépôt cible (branches, commits, diff, push) */`
- `services/processes.ts` → `/** Processus — registre taskId → ChildProcess actif (stdin/stdout) */`
- `services/tasks.ts` → `/** Tâches — cycle de vie des tâches (create, read, update, delete, status) */`
- `agent/issue.ts` → `/** Issue Agent — génère et sauvegarde le plan pour une issue GitHub */`
- `agent/prompt.ts` → `/** Prompts — formate les prompts d'implémentation pour Claude */`
- `logs.ts` → `/** Logs — bus d'événements de logging serveur (EventEmitter) */`

**Étape 2 — Endpoints `+server.ts` (46 fichiers)** ✅
- Domaine Agent (5) : run, input, kill, session, preview-prompt
- Domaine Tâches (11) : tasks, [id], commit, diff, initial-commit, merge, methods, plan, push, revert, sync
- Domaine Cartographie (9) : +server, comment, diagram, enrich, methods, refresh, run, snippet, stats
- Domaine Contexte (1) : context
- Domaine GitHub/Issues (9) : github/issues, issue, issues, analysis, analyze, analyze/update, roadmap/chat, roadmaps, snapshot
- Domaine Logs/Plans (2) : logs, plan
- Domaine Config/Projets/Dépôt (6) : project-config, projects, current, github, repo-file, repo-info
- Domaine Usage/Atlas (3) : usage, atlas, skills

**Étape 3** — Déclencher un refresh via `/api/cartography/refresh` depuis l'interface pour que le panneau Atlas reflète les nouvelles identités.