# Plan : Réduire le scope de la recherche cartographique

## 1. Analyse du problème

L'input "Rechercher dans le code" déclenche `grepProject` dans `scripts/cartography-search.cjs`.

Pour la query `"Mettre le chat dans une boite"`, le code extrait les mots ≥ 4 lettres :

```
["mettre", "chat", "dans", "boite"]
```

Deux problèmes causent 56 résultats hors scope :

### Problème A — "chat" matche `catch`

La recherche utilise `low.includes(w)` sans frontière de mot.
`catch` contient `chat` → chaque ligne avec un bloc `try/catch` du projet lolve est retournée.
En JS/TS, `catch` est présent dans presque chaque fichier → explosion des faux positifs.

### Problème B — "dans" est un stop word français

"dans" (4 lettres, non filtré) est une préposition ultra-commune en français.
Elle apparaît dans des commentaires, JSDoc, messages d'erreur → plusieurs dizaines de lignes touchées.

### Cause racine

```js
// ligne 68 de cartography-search.cjs
const words = [...new Set(query.toLowerCase().split(/\s+/).filter(w => w.length >= 4))];
```

Deux lacunes :
1. Pas de frontière de mot (`\b`) → sous-chaîne matching
2. Pas de liste de stop words français → mots fonctionnels inclus dans la recherche

---

## 2. Localisation des usages

| Fichier | Ligne | Rôle |
|---|---|---|
| `scripts/cartography-search.cjs` | 68 | Extraction des mots de la query |
| `scripts/cartography-search.cjs` | 88-100 | Boucle grep avec `low.includes(w)` |
| `src/routes/api/cartography/+server.ts` | 21 | Appel du script via `execSync` |
| `src/lib/components/AgentConsole.svelte` | 191-210 | Envoi de la query à l'API |

Aucun autre composant n'utilise `grepProject` directement.
`MethodSearch` (lolve-cartography natif) a son propre système de scoring — non concerné.

---

## 3. Stratégie de remplacement

Deux modifications complémentaires, **toutes deux dans `scripts/cartography-search.cjs`** :

### Fix A — Word boundary (regex `\b`)

Remplacer `low.includes(w)` par un test regex avec frontière de mot.

```js
// Avant
if (words.some(w => low.includes(w))) {

// Après
if (words.some(w => wordRegexes[w].test(low))) {
```

Où `wordRegexes` est un cache de `new RegExp(`\\b${w}\\b`)` construit une fois avant la boucle.

Effet : "chat" ne matche plus "catch", "dispatch", "chatbox", etc.

### Fix B — Stop words français

Ajouter une liste de stop words à filtrer après l'extraction des mots ≥ 4 lettres.

```js
const STOP_WORDS = new Set([
    // Articles
    'les', 'des', 'une',
    // Prépositions
    'dans', 'avec', 'pour', 'sans', 'sous', 'vers', 'chez', 'entre', 'depuis',
    'avant', 'apres', 'selon', 'parmi',
    // Pronoms/déterminants
    'cette', 'cela', 'ceci', 'leur', 'leurs', 'dont', 'mais', 'donc', 'ainsi',
    // Verbes auxiliaires courants
    'avoir', 'etre', 'faire', 'mettre', 'prendre', 'tenir',
    // Conjonctions
    'comme', 'puis', 'aussi',
]);
```

Note : "mettre" est aussi un stop word en contexte technique.

La nouvelle extraction :
```js
const words = [...new Set(
    query.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
)];
```

Pour "Mettre le chat dans une boite" → mots retenus : `["chat", "boite"]`
Avec word boundary : "chat" ne matche plus "catch" → résultats pertinents uniquement.

---

## 4. Étapes de modification du code

### Étape 1 — Ajouter les stop words

Dans `scripts/cartography-search.cjs`, après la ligne `'use strict';` et avant `grepProject`, ajouter :

```js
const STOP_WORDS = new Set([
    'dans', 'avec', 'pour', 'sans', 'sous', 'vers', 'chez', 'entre', 'depuis',
    'avant', 'apres', 'selon', 'parmi', 'cette', 'cela', 'ceci', 'leur', 'leurs',
    'dont', 'mais', 'donc', 'ainsi', 'comme', 'puis', 'aussi',
    'avoir', 'etre', 'faire', 'mettre', 'prendre', 'tenir',
]);
```

### Étape 2 — Mettre à jour l'extraction des mots (ligne 68)

```js
// Avant
const words = [...new Set(query.toLowerCase().split(/\s+/).filter(w => w.length >= 4))];

// Après
const words = [...new Set(
    query.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
)];
```

### Étape 3 — Ajouter les regexes avec frontière de mot

Juste après l'extraction des mots, avant la fonction `walk` :

```js
// Cache des regexes avec word boundary pour éviter "chat" dans "catch"
const wordRegexes = Object.fromEntries(
    words.map(w => [w, new RegExp(`\\b${w}\\b`, 'i')])
);
```

### Étape 4 — Remplacer le test `includes` par regex (ligne 90)

```js
// Avant
if (words.some(w => low.includes(w))) {

// Après
if (words.length > 0 && words.some(w => wordRegexes[w].test(lines[i]))) {
```

Note : `wordRegexes[w]` a déjà le flag `i` (insensible à la casse), donc `low` n'est plus nécessaire — on peut tester directement `lines[i]`.

### Étape 5 — Gérer le cas "aucun mot significatif"

Si après filtrage `words.length === 0` (ex : query = "le la les"), retourner immédiatement `[]` sans parcourir les fichiers.

```js
if (words.length === 0) return [];
walk(projectPath);
```

---

## 5. Vérifications et nettoyage final

### Tests manuels à effectuer

| Query | Attendu |
|---|---|
| `"Mettre le chat dans une boite"` | 0 ou très peu de résultats grep (pas de faux positifs "catch") |
| `"TODO"` | Résultats inchangés (mot ≥ 4, pas dans stop words) |
| `"chatbox"` | Pas de match sur les lignes contenant seulement `catch` |
| `"authentification token"` | Résultats pertinents, pas de régression |
| `"dans"` seul | 0 résultats grep (stop word) |
| `"le"` seul | 0 résultats grep (< 4 lettres, déjà filtré) |

### Vérifications de non-régression

- La recherche "TODO" continue de fonctionner (chargement au montage de `AgentConsole.svelte`)
- `grepMethods` (croisement grep × méthodes) fonctionne toujours avec les nouveaux résultats
- `results` (MethodSearch sémantique) n'est pas affecté — logique différente, non modifiée

### Nettoyage

- Aucun fichier à supprimer
- La variable `low` à la ligne 89 peut être supprimée si on utilise les regexes insensibles à la casse directement sur `lines[i]` — ou conservée pour clarté
- Pas de migration de données nécessaire (index non modifié)

---

## Résumé des fichiers modifiés

| Fichier | Nature de la modification |
|---|---|
| `scripts/cartography-search.cjs` | Ajout STOP_WORDS, word boundary regex, garde `words.length === 0` |

Aucune modification côté serveur SvelteKit ni côté UI.
