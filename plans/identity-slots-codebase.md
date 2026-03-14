# Plan — Identité des slots de la codebase Claudicator

**Objectif** : Donner une identité sémantique à chaque `+server.ts` et service
`lib/server/` qui apparaît comme "helper" anonyme dans le panneau Atlas.

---

## 1. Analyse du problème

### Cause racine

Le panneau Atlas identifie chaque module via le **premier commentaire JSDoc**
trouvé dans le fichier. Si aucun commentaire de module n'existe en tête, Atlas
tombe sur le commentaire d'une fonction utilitaire interne (d'où des identités
comme `"Supprime les séquences d'échappement ANSI"` pour un endpoint de streaming)
ou affiche `"helper"` par défaut.

Problème structurel SvelteKit : tous les endpoints s'appellent `+server.ts`.
Atlas ne peut pas les distinguer par nom — seul un commentaire de **module**
en tête du fichier permet l'identification.

### Ampleur

- **~46 fichiers** `+server.ts` sans identité de module
- **~7 services** `lib/server/` affichés "helper" sans description utile
- Le `.cache/project-diagram.md` n'indexe que **5 méthodes dans 4 fichiers** →
  la cartographie de claudicator elle-même est quasi vide

### Ce qui fonctionne déjà

Certains modules `lib/server/` ont des identités cohérentes car leurs fichiers
contiennent des commentaires JSDoc riches (ex. `cartography.ts`, `claude-session.ts`,
`project-config.ts`, `projects.ts`, `usage.ts`).

---

## 2. Localisation des usages

### 2a. Fichiers `+server.ts` à identifier (46 fichiers)

Regroupés par domaine fonctionnel, avec le commentaire de module cible :

#### Domaine Agent
| Fichier | Identité cible |
|---------|----------------|
| `api/agent/run/+server.ts` | `/** Agent — lance Claude en SSE, sauvegarde le plan (POST) */` |
| `api/agent/input/+server.ts` | `/** Agent — envoie une entrée stdin au processus actif (POST) */` |
| `api/agent/kill/+server.ts` | `/** Agent — interrompt le processus Claude en cours (POST) */` |
| `api/agent/session/+server.ts` | `/** Agent — détruit la session Claude active (DELETE) */` |
| `api/agent/preview-prompt/+server.ts` | `/** Agent — prévisualise le prompt avant exécution (POST) */` |

#### Domaine Cartographie
| Fichier | Identité cible |
|---------|----------------|
| `api/cartography/+server.ts` | `/** Cartographie — recherche sémantique dans le projet (POST) */` |
| `api/cartography/comment/+server.ts` | `/** Cartographie — génère un commentaire pour une méthode via Claude (POST) */` |
| `api/cartography/diagram/+server.ts` | `/** Cartographie — génère l'arbre visuel JS/TS avec méthodes (POST) */` |
| `api/cartography/enrich/+server.ts` | `/** Cartographie — enrichit les descriptions de méthodes via Claude (POST) */` |
| `api/cartography/methods/+server.ts` | `/** Cartographie — liste les méthodes indexées avec métadonnées (GET) */` |
| `api/cartography/refresh/+server.ts` | `/** Cartographie — relance l'indexation du projet (POST) */` |
| `api/cartography/run/+server.ts` | `/** Cartographie — exécute une commande de cartographie en SSE (POST) */` |
| `api/cartography/snippet/+server.ts` | `/** Cartographie — extrait le snippet de code d'une méthode (GET) */` |
| `api/cartography/stats/+server.ts` | `/** Cartographie — retourne les statistiques d'indexation (GET) */` |

#### Domaine Contexte
| Fichier | Identité cible |
|---------|----------------|
| `api/context/+server.ts` | `/** Contexte — construit le contexte agent (symbol map + snippets) (POST) */` |

#### Domaine GitHub / Issues
| Fichier | Identité cible |
|---------|----------------|
| `api/github/issues/+server.ts` | `/** GitHub — crée une issue dans le dépôt courant (POST) */` |
| `api/issue/+server.ts` | `/** GitHub — lit une issue avec ses sous-issues (GET) */` |
| `api/issues/+server.ts` | `/** GitHub — liste toutes les issues du projet (GET) */` |
| `api/issues/analysis/+server.ts` | `/** Issues — déclenche l'analyse d'issues via Claude (POST) */` |
| `api/issues/analyze/+server.ts` | `/** Issues — analyse et génère un plan de roadmap (POST) */` |
| `api/issues/analyze/update/+server.ts` | `/** Issues — met à jour une analyse existante via Claude (POST) */` |
| `api/issues/roadmap/chat/+server.ts` | `/** Issues — endpoint de chat pour l'agent roadmap (POST) */` |
| `api/issues/roadmaps/+server.ts` | `/** Issues — liste les fichiers roadmap Markdown sauvegardés (GET) */` |
| `api/issues/snapshot/+server.ts` | `/** Issues — lit le snapshot d'issue et le statut d'analyse (GET) */` |

#### Domaine Logs / Plans
| Fichier | Identité cible |
|---------|----------------|
| `api/logs/+server.ts` | `/** Logs — diffuse les logs en temps réel via SSE (GET) */` |
| `api/plan/+server.ts` | `/** Plans — retourne le plan global d'une issue (GET) */` |

#### Domaine Configuration projet
| Fichier | Identité cible |
|---------|----------------|
| `api/project-config/+server.ts` | `/** Config — lit ou met à jour la configuration du projet (GET, PATCH) */` |

#### Domaine Projets
| Fichier | Identité cible |
|---------|----------------|
| `api/projects/+server.ts` | `/** Projets — liste les projets ou en ajoute un (GET, POST) */` |
| `api/projects/current/+server.ts` | `/** Projets — définit ou supprime le projet courant (PATCH, DELETE) */` |
| `api/projects/github/+server.ts` | `/** Projets — liste les dépôts GitHub accessibles (GET) */` |

#### Domaine Dépôt
| Fichier | Identité cible |
|---------|----------------|
| `api/repo-file/+server.ts` | `/** Dépôt — récupère un fichier depuis GitHub (GET) */` |
| `api/repo-info/+server.ts` | `/** Dépôt — retourne les infos du projet courant (owner/repo) (GET) */` |

#### Domaine Tâches
| Fichier | Identité cible |
|---------|----------------|
| `api/tasks/+server.ts` | `/** Tâches — liste toutes les tâches ou en crée une (GET, POST) */` |
| `api/tasks/[id]/+server.ts` | `/** Tâches — lit, met à jour ou supprime une tâche (GET, PATCH, DELETE) */` |
| `api/tasks/[id]/commit/+server.ts` | `/** Tâches — commite les changements sur la branche de la tâche (POST) */` |
| `api/tasks/[id]/diff/+server.ts` | `/** Tâches — retourne le git diff de la tâche (GET) */` |
| `api/tasks/[id]/initial-commit/+server.ts` | `/** Tâches — crée la branche initiale et commite le plan (POST) */` |
| `api/tasks/[id]/merge/+server.ts` | `/** Tâches — crée une PR et merge la branche de la tâche (POST) */` |
| `api/tasks/[id]/methods/+server.ts` | `/** Tâches — retourne les méthodes pertinentes pour la tâche (GET) */` |
| `api/tasks/[id]/plan/+server.ts` | `/** Tâches — lit le plan de la tâche depuis le disque (GET) */` |
| `api/tasks/[id]/push/+server.ts` | `/** Tâches — pousse la branche de la tâche vers le remote (POST) */` |
| `api/tasks/[id]/revert/+server.ts` | `/** Tâches — annule tous les changements non commités (POST) */` |
| `api/tasks/[id]/sync/+server.ts` | `/** Tâches — synchronise l'état push/merge de la tâche (POST) */` |

#### Domaine Usage / Atlas
| Fichier | Identité cible |
|---------|----------------|
| `api/usage/+server.ts` | `/** Usage — retourne la consommation de tokens du projet (GET) */` |
| `api/atlas/+server.ts` | `/** Atlas — retourne les régions sémantiques et compétences (GET) */` |
| `api/skills/+server.ts` | `/** Atlas — retourne le registre des compétences (GET) */` |

### 2b. Services `lib/server/` à améliorer (7 fichiers)

| Fichier | Problème | Identité cible |
|---------|----------|----------------|
| `services/claude.ts` | "helper" | `/** Claude CLI — exécute un prompt via le CLI claude (POST) */` |
| `services/git.ts` | "helper" | `/** Git — opérations sur le dépôt cible (branches, commits, diff, push) */` |
| `services/processes.ts` | "helper" | `/** Processus — registre taskId → ChildProcess actif (stdin/stdout) */` |
| `services/tasks.ts` | "helper" | `/** Tâches — cycle de vie des tâches (create, read, update, delete, status) */` |
| `agent/issue.ts` | "helper" | `/** Issue Agent — génère et sauvegarde le plan pour une issue GitHub */` |
| `agent/prompt.ts` | "helper" | `/** Prompts — formate les prompts d'implémentation pour Claude */` |
| `logs.ts` | "helper" | `/** Logs — bus d'événements de logging serveur (EventEmitter) */` |

---

## 3. Stratégie de remplacement

**Aucune migration de code ni refactoring.** La stratégie se limite à
**ajouter une seule ligne** en tête de chaque fichier concerné.

### Format du commentaire de module

```ts
/** [Domaine] — [rôle principal du module] ([verbes HTTP si endpoint]) */
import { json } from "@sveltejs/kit";
```

### Règles de rédaction

- Toujours **avant les imports** (première ligne du fichier)
- Format JSDoc simple (`/** ... */` sur une seule ligne)
- **Français**, concis, max 12 mots
- Pour les endpoints : inclure les verbes HTTP entre parenthèses
- Pour les services : décrire la responsabilité principale

### Pourquoi cette approche

- Zéro risque de régression : les commentaires ne sont pas du code exécutable
- Pas de modification d'API ni de types
- Cohérent avec le pattern déjà utilisé dans les fichiers qui ont une identité
  (ex. `cartography.ts` ligne 1 : `/** Initialise (ou réinitialise)... */`)
- Immédiatement visible dans le panneau Atlas après refresh de la cartographie

---

## 4. Étapes de modification du code

Les modifications sont **toutes du même type** : ajout d'une ligne en tête de fichier.
Elles sont indépendantes et peuvent être réalisées dans n'importe quel ordre.

### Étape 1 — Services `lib/server/` (7 fichiers, priorité haute)

Ces fichiers sont référencés dans l'ATLAS/MODULES et leur identité impacte
directement la qualité du contexte injecté dans les prompts Claude.

Pour chaque fichier de la table 2b, ajouter le commentaire avant le premier import.

**Exemple pour `services/tasks.ts`** :
```diff
+/** Tâches — cycle de vie des tâches (create, read, update, delete, status) */
 import fs from "fs";
 import path from "path";
```

### Étape 2 — Endpoints `+server.ts` par domaine (46 fichiers)

Procéder domaine par domaine selon la table 2a :

**Ordre recommandé** (du plus visible au moins visible) :
1. Domaine Tâches (11 fichiers — endpoint central du workflow)
2. Domaine Agent (5 fichiers — cœur de l'orchestration Claude)
3. Domaine Cartographie (9 fichiers — pipeline lolve-carto)
4. Domaine GitHub / Issues (9 fichiers)
5. Domaine Projets (3 fichiers)
6. Domaine Dépôt, Logs, Plans, Config, Usage, Atlas (9 fichiers)

**Exemple pour `api/agent/run/+server.ts`** :

Le fichier commence actuellement avec :
```ts
import fs from "fs";
import path from "path";
...
```
Et le premier commentaire JSDoc est (ligne ~20) :
```ts
/** Supprime les séquences d'échappement ANSI d'une chaîne */
```
Ce commentaire interne devient l'identité par défaut d'Atlas → remplacer par
un commentaire de module en tête :
```diff
+/** Agent — lance Claude en SSE, sauvegarde le plan (POST) */
 import fs from "fs";
 import path from "path";
```

### Étape 3 — Refresh de la cartographie

Après avoir modifié tous les fichiers, déclencher un refresh de l'index
lolve-cartography via `/api/cartography/refresh` pour que le panneau Atlas
reflète les nouvelles identités.

---

## 5. Vérifications et nettoyage final

### 5a. Vérifications de non-régression

| Vérification | Méthode |
|---|---|
| Aucun import cassé | Les commentaires sont avant les imports, TypeScript ignore les commentaires |
| Aucun changement de comportement API | Les fonctions `GET`/`POST`/etc. ne sont pas modifiées |
| Aucun conflit de nommage | Les commentaires JSDoc ne créent pas de symboles TypeScript |
| SvelteKit routing intact | `+server.ts` garde son nom et sa localisation |

### 5b. Validation visuelle dans Atlas

Après refresh, vérifier dans le panneau de symboles que :
- Aucun `+server` n'apparaît plus comme "helper" sans identité
- Chaque entrée affiche son commentaire de module comme identité
- Les domaines fonctionnels sont lisibles (Agent, Tâches, Cartographie…)

### 5c. Critères de succès

```
Avant : ~46 entrées "+server helper" anonymes
Après : 0 entrée "+server" sans identité sémantique

Avant : ~7 services "helper" sans description
Après : 0 service sans identité
```

### 5d. Nettoyage optionnel

Si après refresh le `.cache/project-diagram.md` reste peu peuplé (5 méthodes),
envisager de relancer `api/cartography/diagram` pour régénérer le diagramme
complet de claudicator. Ce n'est pas bloquant pour l'identité des slots mais
améliorerait la qualité du contexte Atlas global.

---

## Résumé

| Phase | Action | Fichiers | Risque |
|-------|--------|----------|--------|
| 1 | Ajouter commentaires modules `lib/server/` | 7 | Nul |
| 2 | Ajouter commentaires modules `+server.ts` | 46 | Nul |
| 3 | Refresh cartographie | — | Nul |
| 4 | Validation visuelle Atlas | — | — |

**Aucune migration, aucun refactoring, aucune modification de logique.**
Uniquement des commentaires JSDoc de module, un par fichier.
