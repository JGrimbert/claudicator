# Plan : God Object Scanner

## Objectif

Ajouter dans Claudicator une feature de détection et refactoring des fichiers "god object" :
1. **Scanner** : analyse les fichiers sources, identifie les fichiers dépassant un seuil de lignes, sauvegarde le résultat.
2. **Lancer un refactoring** : pour un fichier donné, crée une tâche avec un plan d'architecture pré-rempli demandant à Claude de modulariser le fichier.

---

## Architecture

### Nouveaux fichiers

| Fichier | Rôle |
|---|---|
| `src/lib/server/services/god-objects.ts` | Scan, persistence, génération du prompt |
| `src/routes/api/god-objects/+server.ts` | GET (charger scan), POST (lancer scan) |
| `src/routes/api/god-objects/task/+server.ts` | POST (créer tâche de refacto) |

### Fichiers modifiés

| Fichier | Modification |
|---|---|
| `src/lib/components/ProjetPanel.svelte` | Nouvel onglet "Santé" avec liste + boutons |

---

## Étape 1 — Service `god-objects.ts`

```typescript
// src/lib/server/services/god-objects.ts

export type GodObjectEntry = {
    path: string;        // chemin relatif depuis la racine du projet
    lines: number;
    severity: "warning" | "critical";
};

export type GodObjectScan = {
    scannedAt: string;   // ISO 8601
    projectRoot: string;
    thresholds: { warning: number; critical: number };
    files: GodObjectEntry[];
};

// Par défaut : warning ≥ 400 lignes, critical ≥ 700 lignes
export function scanGodObjects(projectRoot: string, thresholds?): GodObjectScan
export function loadGodObjects(): GodObjectScan | null
```

**Persistance** : `.agent/god-objects.json` à la racine de claudicator (`process.cwd()`).

**Extensions scannées** : `.svelte`, `.ts`, `.js`

**Répertoires ignorés** : `node_modules`, `.agent`, `dist`, `.svelte-kit`, `build`, `patches`

---

## Étape 2 — Routes API

### `GET /api/god-objects`
Retourne le dernier scan sauvegardé (`null` si aucun).

### `POST /api/god-objects`
Corps optionnel : `{ thresholds?: { warning: number; critical: number } }`
Lance le scan sur le projet actif (`getProjectRoot()`), sauvegarde et retourne le résultat.

### `POST /api/god-objects/task`
Corps : `{ file: string; lines: number }`
Crée une tâche `createTask({ title })` avec statut `implementation` et écrit le plan de refactoring dans `.agent/tasks/<taskId>.plan.md`.
Retourne la tâche créée.

---

## Étape 3 — Plan de refactoring (template)

Le plan pré-rempli dans la tâche :

```markdown
# Refactoring architectural : {file}

## Contexte
Le fichier `{file}` fait **{lines} lignes** et dépasse le seuil acceptable.

## Objectif
Analyser les responsabilités de ce fichier et le découper en modules cohérents,
sans modifier le comportement externe.

## Travail attendu

### 1. Audit des responsabilités
- Identifier les blocs logiques distincts (state, UI, handlers, utils…)
- Lister les dépendances internes et externes

### 2. Proposition d'architecture
- Proposer les sous-composants/modules avec leurs interfaces
- Justifier le découpage

### 3. Implémentation
- Créer les nouveaux fichiers
- Déplacer le code concerné
- Mettre à jour les imports dans les fichiers existants
- Vérifier que le comportement reste identique

## Contraintes
- Préserver 100% du comportement existant
- Un seul composant par responsabilité
- Interfaces propres entre modules (pas d'export de state interne)

## Fichier cible
`{file}` ({lines} lignes)
```

---

## Étape 4 — UI dans `ProjetPanel.svelte`

Ajout d'un onglet **"Santé"** dans la liste des tabs existants (TODO / Issues / Tasks / **Santé**).

Contenu de l'onglet (via `customcontent`) :

```
┌─────────────────────────────────────┐
│  Analysé le : 5 avr. 2026  [Scanner]│
├─────────────────────────────────────┤
│ 🔴 TaskDetail.svelte       1850 l.  │  [→ Refacto]
│ 🔴 PlanPanel.svelte        1784 l.  │  [→ Refacto]
│ 🟠 IssueAnalysis.svelte    1278 l.  │  [→ Refacto]
│ …                                   │
└─────────────────────────────────────┘
```

- **"Scanner"** : appelle `POST /api/god-objects`, met à jour la liste
- **"→ Refacto"** : appelle `POST /api/god-objects/task`, déclenche `notifyTaskCreated` pour rafraîchir l'onglet Tasks
- Icône rouge `●` pour critical (≥700), orange `●` pour warning (≥400)
- Si tâche déjà créée pour ce fichier : bouton grisé/done (tracking via `Set<string>` local)

---

## Flux complet

```
Clic "Scanner"
  → POST /api/god-objects
  → scanGodObjects(projectRoot)   ← parcourt src/**
  → .agent/god-objects.json       ← sauvegarde
  → liste affichée dans l'onglet

Clic "→ Refacto" sur PlanPanel.svelte
  → POST /api/god-objects/task { file, lines }
  → createTask({ title: "Refactoring: PlanPanel.svelte (1784 lignes)", status: "implementation" })
  → écriture .agent/tasks/<id>.plan.md  ← plan pré-rempli
  → notifyTaskCreated()           ← onglet Tasks se rafraîchit
  → bouton passe en état "done"
```

---

## Décisions

- **Seuils** : warning=400, critical=700 (cohérent avec la taille de TaskList après refacto ~485 lignes)
- **Scan du projet actif** (`getProjectRoot()`) — si claudicator est le projet actif, scan de `src/`
- **Pas de GitHub issue automatique** — la tâche locale suffit, l'utilisateur peut créer l'issue manuellement
- **Statut initial** `implementation` — le plan est déjà prêt, Claude peut l'implémenter directement
