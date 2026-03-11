Je vais d'abord lire les fichiers pertinents pour comprendre le problème avant de rédiger le plan.
Maintenant regardons l'interface de recherche dans l'UI et la route API correspondante.
Maintenant regardons la route `/api/cartography` POST qui est l'endpoint utilisé par la recherche.
Maintenant je comprends le problème. Regardons rapidement les plans existants pour respecter le format.
J'ai maintenant toutes les informations nécessaires. Je vais rédiger le plan.

**Analyse rapide du problème** :

Pour "Mettre le chat dans une boite", `grepProject` extrait les mots `≥ 4 lettres` : `["mettre", "chat", "dans", "boite"]`

- **"chat"** matche `catch` (mot-clé JS omniprésent) → explosion de faux positifs
- **"dans"** matche commentaires en français, variables, etc.
- La recherche utilise `String.includes()` sans frontière de mot
Plan créé dans `plans/search-scope-plan.md`.

---

## Synthèse du diagnostic

Le problème vient de **deux lacunes combinées** dans `scripts/cartography-search.cjs` :

### Cause A — "chat" matche `catch`
La recherche utilise `String.includes()` sans frontière de mot. `catch` contient `chat` → chaque bloc `try/catch` du projet est retourné. En JS/TS c'est omniprésent.

### Cause B — "dans" est un stop word non filtré
"dans" (4 lettres) passe le filtre de longueur. Il apparaît dans des dizaines de commentaires et messages d'erreur en français.

---

## Solution proposée (2 changements, 1 seul fichier)

**`scripts/cartography-search.cjs`** :

1. **Stop words français** — filtrer "dans", "avec", "pour", "mettre", etc. après l'extraction des mots
2. **Word boundary regex** — remplacer `low.includes(w)` par `new RegExp(\`\\b${w}\\b\`, 'i').test(line)` pour que "chat" ne matche plus "catch"

Pour "Mettre le chat dans une boite" → après filtrage : `["chat", "boite"]` avec word boundary → 0 faux positifs sur `catch`.

`MethodSearch` de lolve-cartography (résultats sémantiques) n'est **pas concerné** — son scoring est natif et séparé.