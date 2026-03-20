# Plan : Remplacement du scoring manuel par MiniSearch dans `method-search.cjs`

## 1. Analyse du problème

### Système actuel (`_doSearch`)
- Itère sur `Object.entries(methods)` — O(n) pour chaque requête
- Score = accumulation manuelle de points fixes (`includes` / exact match)
- Pas de pondération TF-IDF : un mot fréquent comme "user" dans 200 méthodes vaut autant qu'un mot rare
- Tokenisation absente : `getUserList` ne matche pas "list" ou "user" séparément
- Plafond artificiel sur la description (max 2 hits)
- Champ `consumers` peu valorisé (+2 par consumer, sans normalisation)

### Ce que MiniSearch apporte
- Index en mémoire, rebuild O(n), recherche O(log n)
- TF-IDF natif : discrimine les termes rares des termes fréquents
- Boost par champ configurable : `name × 3`, `consumers × 2`
- Tokenizer custom : splitter camelCase → matching FR→EN
- Fuzzy intégré : `{ fuzzy: 0.2 }` pour les typos

### Contrainte CJS critique
MiniSearch v7+ est ESM-only. Utiliser **MiniSearch v6.x** (dernière version
CJS-compatible, API identique pour nos besoins). Éviter `await import()` qui
forcerait une interface async et casserait tous les consommateurs.

---

## 2. Localisation des usages

### Consommateurs directs de `findRelevantMethods`

| Fichier | Ligne | Usage |
|---|---|---|
| `lib/context/method-search.cjs` | 40, 45 | Définition — `_doSearch` appelé 2 fois dans `findRelevantMethods` |
| `lib/mcp/context-agent.cjs` | 143 | `this.methodSearch.findRelevantMethods(query, options)` |
| `lib/context/search-session.cjs` | 58 | `this.agent.findRelevantMethods(this.query, this.options)` |
| `lib/context/index.cjs` | — | Re-export uniquement, pas d'usage direct |

### Interface de retour attendue (à préserver absolument)
```js
[{ key: string, method: Object, score: number }]
```

### Consommateurs qui lisent `score`
- `search-session.cjs:91` → `.score` affiché dans `results`
- `search-session.cjs:437–591` → `score` dans `getAtLevel`, `toContext`, `toPrompt`
- `claudicator/src/lib/server/agent/context.ts` → compare `kwScore > 0`

**Conclusion** : la valeur absolue de `score` n'est pas critique — les consommateurs
comparent au seuil `minScore` ou l'affichent. La migration doit s'assurer que les
bons résultats ont un score > `minScore`.

### Consommateurs de `_doSearch`
- Uniquement interne à `MethodSearch.findRelevantMethods` (lignes 40 et 45)
- Aucun export externe → remplacement transparent

---

## 3. Stratégie de remplacement

### 3.1 Version à installer
```bash
npm install minisearch@6
```
`minisearch@6` = CJS natif, synchrone, API stable.

### 3.2 Architecture de l'index : lazy init avec cache
`methodIndexer.index.methods` est stable après construction de `MethodSearch`.
L'index MiniSearch peut être construit **une seule fois** au premier appel de
`_doSearch` via un champ `this._miniSearch = null` initialisé dans le constructeur.

Avantage : pas de rebuild à chaque recherche, cohérence garantie si l'index
méthodes ne change pas après construction.

### 3.3 Champs indexés
```js
{
  id: key,                  // "ClassName.methodName"
  name: method.name,        // camelCase → tokenisé
  className: method.class,  // bonus si la classe est nommée dans la query
  description: method.description || '',
  consumers: (method.consumers || []).join(' '),
  effects: Object.values(method.effects || {}).flat().join(' ')
}
```

### 3.4 Tokenizer camelCase (appliqué à l'index ET à la query)
```js
function tokenizeCamel(str) {
  return String(str)
    .split(/(?=[A-Z])|[\s_\-\.]+/)
    .map(s => s.toLowerCase())
    .filter(s => s.length > 1);
}
```
Exemple : `getUserList` → `['get', 'user', 'list']`
Exemple query : `"liste utilisateurs"` → `['liste', 'utilisateurs']`
(MiniSearch applique le même tokenizer à la query → les tokens communs matchent)

### 3.5 Configuration MiniSearch
```js
new MiniSearch({
  fields: ['name', 'className', 'description', 'consumers', 'effects'],
  idField: 'id',
  tokenize: tokenizeCamel,
  processTerm: (term) => STOPWORDS.has(term) ? null : term
})
```
Options de recherche passées à chaque `.search()` :
```js
{
  boost: { name: 3, className: 2, consumers: 2, description: 1, effects: 1 },
  fuzzy: 0.2,
  prefix: true
}
```

### 3.6 Mapping score MiniSearch → interface `{ key, method, score }`
Les scores MiniSearch sont des flottants TF-IDF (typiquement 0.1–20+).
Le `minScore` par défaut actuel est 3 (entier, échelle manuelle).

**Point d'attention** : avec `minScore: 3`, les matches faibles (description seule)
pourraient être filtrés correctement, mais les très bons matches `name` (score ~10–15)
passeront sans problème. À valider sur données réelles après implémentation.

**Recommandation** : retourner le score brut MiniSearch sans normalisation.
Si des résultats pertinents disparaissent, ajuster `minScore` default de `3` → `0.5`.

### 3.7 Préservation du bonus "méthode explicite"
Le pattern `Biblio.init` (référence directe dans la query) doit rester géré
**après** la recherche MiniSearch :
```js
if (explicitMethods.has(key.toLowerCase())) score += 50;
```
Ce bonus garantit que les méthodes nommées explicitement sortent en tête, quelle
que soit la pondération TF-IDF.

### 3.8 Filtrage rôles/privé
Appliquer **sur les résultats MiniSearch** (filter post-recherche) :
- `!includePrivate && method.isPrivate` → exclure
- `roles && !roles.includes(method.role)` → exclure
- `excludeRoles.includes(method.role)` → exclure

---

## 4. Étapes de modification du code

### Étape 1 — Installation de MiniSearch
```bash
cd C:/lolve-cartography
npm install minisearch@6
```
Vérifier que `"minisearch": "^6.x.x"` apparaît dans `dependencies` de `package.json`
(pas `devDependencies` — utilisé en runtime).

### Étape 2 — Modifier `lib/context/method-search.cjs`

**2a. Déplacer STOPWORDS au niveau module et ajouter l'import + tokenizer**

En tête du fichier, après `const { log } = require(...)` :
```js
const MiniSearch = require('minisearch');

const STOPWORDS = new Set([
  'les', 'des', 'une', 'est', 'que', 'qui', 'dans', 'pour', 'par', 'sur',
  'avec', 'son', 'ses', 'leur', 'mes', 'nos', 'vos', 'aux', 'pas', 'plus',
  'tout', 'mais', 'comme', 'bien', 'aussi', 'quand', 'donc', 'cette', 'ces',
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'not', 'are', 'have',
  'when', 'get', 'set', 'add', 'run', 'new', 'use', 'can', 'should',
]);

function tokenizeCamel(str) {
  return String(str)
    .split(/(?=[A-Z])|[\s_\-\.]+/)
    .map(s => s.toLowerCase())
    .filter(s => s.length > 1);
}
```

**2b. Initialiser `_miniSearch` dans le constructeur**
```js
constructor(methodIndexer, annotationCache) {
  this.methodIndexer = methodIndexer;
  this.annotationCache = annotationCache;
  this._miniSearch = null;  // lazy init
}
```

**2c. Ajouter la méthode `_buildIndex()`**
```js
_buildIndex() {
  if (this._miniSearch) return;

  const ms = new MiniSearch({
    fields: ['name', 'className', 'description', 'consumers', 'effects'],
    idField: 'id',
    tokenize: tokenizeCamel,
    processTerm: (term) => STOPWORDS.has(term) ? null : term
  });

  const methods = this.methodIndexer.index.methods || {};
  const docs = Object.entries(methods).map(([key, method]) => ({
    id: key,
    name: method.name || '',
    className: method.class || '',
    description: method.description || '',
    consumers: (method.consumers || []).join(' '),
    effects: Object.values(method.effects || {}).flat().join(' ')
  }));

  ms.addAll(docs);
  this._miniSearch = ms;
}
```

**2d. Remplacer `_doSearch` par la version MiniSearch**
```js
_doSearch(query, options) {
  const { maxMethods, minScore, roles, excludeRoles, includePrivate } = options;

  this._buildIndex();

  const methods = this.methodIndexer.index.methods || {};

  // Détection des références explicites (ex: "Biblio.init")
  const explicitMethodPattern = /([A-Z][a-zA-Z]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const explicitMethods = new Set();
  let match;
  while ((match = explicitMethodPattern.exec(query)) !== null) {
    explicitMethods.add(`${match[1]}.${match[2]}`.toLowerCase());
  }

  // Recherche MiniSearch (TF-IDF + fuzzy + boost par champ)
  const msResults = this._miniSearch.search(query, {
    boost: { name: 3, className: 2, consumers: 2, description: 1, effects: 1 },
    fuzzy: 0.2,
    prefix: true
  });

  const scored = [];

  for (const result of msResults) {
    const key = result.id;
    const method = methods[key];
    if (!method) continue;

    // Filtres rôles / privé
    if (!includePrivate && method.isPrivate) continue;
    if (roles && !roles.includes(method.role)) continue;
    if (excludeRoles && excludeRoles.length > 0 && excludeRoles.includes(method.role)) continue;

    let score = result.score;

    // Bonus pour les méthodes explicitement nommées dans la query
    if (explicitMethods.has(key.toLowerCase())) {
      score += 50;
    }

    if (score >= minScore) {
      scored.push({ key, method, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, maxMethods);

  log('MethodSearch', `${results.length} relevant methods found`, 'success');

  return results;
}
```

**2e. Supprimer le code devenu inutile**
- Tout le contenu de l'ancien `_doSearch` (boucle for, scoring manuel, `queryWords`)
- La constante `STOPWORDS` inline dans l'ancien `_doSearch` (déplacée au niveau module)
- Les commentaires de scoring manuel (`// Score basé sur le nom de la méthode`, etc.)

### Étape 3 — Aucune modification nécessaire dans les autres fichiers
- `search-session.cjs` : interface inchangée, pas de modification
- `lib/mcp/context-agent.cjs` : délègue à `methodSearch.findRelevantMethods`, pas de modification
- `lib/context/index.cjs` : re-export, pas de modification
- `findRelevantMethods` : logique de retry/fallback inchangée

---

## 5. Vérifications et nettoyage final

### 5.1 Régression interface publique
| Point | Statut |
|---|---|
| `findRelevantMethods(query, options)` signature | Inchangée ✓ |
| Valeur de retour `{ key, method, score }[]` | Inchangée ✓ |
| Fallback "extended scope" (`_isRetry`, `minScore - 2`) | Inchangé ✓ |
| `searchMethods(criteria)` | Non modifié ✓ |
| `MethodSearch` export dans `index.cjs` | Inchangé ✓ |

### 5.2 Vérifications manuelles post-implémentation

1. **Tokenizer** : `tokenizeCamel("getUserList")` → `['get', 'user', 'list']`
2. **Requête FR→EN** : `findRelevantMethods("liste utilisateurs")` doit retourner
   des méthodes avec "user"/"list" dans leur nom
3. **Méthode explicite** : `findRelevantMethods("appeler Biblio.init")` doit avoir
   `Biblio.init` en tête avec score >> autres résultats
4. **Filtrage rôles** : `findRelevantMethods("x", { excludeRoles: ['internal'] })`
   ne doit pas retourner de méthodes `role: 'internal'`
5. **Fallback** : requête sans résultats → `_isRetry` déclenché, `includePrivate: true`
6. **Distribution des scores** : logger quelques scores bruts MiniSearch pour valider
   que `minScore: 3` (défaut) ne filtre pas des résultats pertinents

### 5.3 Point d'attention critique : valeur de `minScore`
Le `minScore` actuel est 3 (entier, calibré pour l'ancienne échelle).
Les scores MiniSearch TF-IDF peuvent être inférieurs à 1 pour des matches faibles.

**Action recommandée** : après implémentation, tester avec `minScore: 0` et observer
la distribution réelle, puis ajuster le défaut si nécessaire (ex: `0.5` au lieu de `3`).
Documenter ce changement si effectué car il affecte claudicator (`kwScore > 0`).

### 5.4 Invalidation du cache index
Si `methodIndexer` peut être rechargé après la construction de `MethodSearch`,
ajouter une méthode `invalidateIndex()` :
```js
invalidateIndex() { this._miniSearch = null; }
```
À appeler depuis les points qui rechargent l'index méthodes. Non urgent si l'index
est stable, mais à prévoir pour la robustesse.

### 5.5 Nettoyage
- Vérifier que `minisearch` est dans `dependencies` (pas `devDependencies`)
- Les fichiers `ai/atlas.*.json` et `ai/roadmap.*` sont générés — ne pas modifier
  manuellement, ils se mettront à jour au prochain run de cartographie
- Pas de tests existants dans `lib/` — envisager d'ajouter `test/method-search.test.js`
  (le runner `node --test` est déjà configuré dans `package.json`)
