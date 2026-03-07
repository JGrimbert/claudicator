# Plan — Intégration lolve-cartography dans Claudicator

## Commandes disponibles

| Commande | Description | Priorité |
|----------|-------------|----------|
| `annotate full` | Pipeline complet : index + enrich + merge | Bouton principal |
| `annotate full --force` | Re-indexation forcée complète | Bouton secondaire |
| `annotate index` | Index seul (rôles, signatures) | Disponible |
| `annotate enrich` | Enrichissement effets/consumers | Disponible |
| `annotate scan` | Aperçu sans écriture | Disponible |
| `annotate stats` | Statistiques brutes | Monitoring auto |

## Ce qu'on peut monitorer

- Nombre total de méthodes indexées
- Nombre de fichiers couverts
- Nombre de méthodes avec `description` (enrichissement Claude)
- Distribution des rôles (internal / helper / service / flow / core / entry)
- Timestamp de dernière mise à jour de l'index

## Pourquoi 14/140 descriptions ?

`annotate full` n'a jamais été exécuté jusqu'au bout sur ce projet.
`annotate index` génère les rôles via AST (tous les 140).
`annotate enrich` appelle Claude pour générer les descriptions — interrompu à 14.
La commande à lancer : `annotate full --force`.

## Layout UI — Réorganisation AgentConsole

### Avant
```
[header AGENT]
[stats carto]
[cards README / CLAUDE]
[recherche]
[plan]
```

### Après
```
┌─────────────────────────────────────────────┐
│ PROJET                                      │
│ méthodes 140 · fichiers 61 · décrites 14   │
│ [Full] [Full --force] [Scan] [Stats]        │
│ [README.md preview] [CLAUDE.md preview]     │
├─────────────────────────────────────────────┤
│ AGENT                                       │
│ [barre de recherche cartographique]         │
│ [résultats de recherche]                    │
│                                             │
│ [plan de l'issue sélectionnée]              │
└─────────────────────────────────────────────┘
```

## Étapes d'implémentation

### Étape 1 — Nouvel endpoint `POST /api/cartography/run`
Paramètre `{ cmd: "full" | "full:force" | "index" | "enrich" | "scan" }`.
Streaming SSE des logs.
Recharge les stats à la fin.

### Étape 2 — Endpoint `GET /api/cartography/stats` (existant)
Ajouter `updatedAt` depuis `method-index.json` si présent.

### Étape 3 — Redesign AgentConsole
- Section **PROJET** : header + stats bar + boutons commandes + cards fichiers
- Section **AGENT** : header + recherche + résultats + plan

### Étape 4 — Log streaming dans la section PROJET
Afficher les dernières lignes de log lors d'une commande en cours.
