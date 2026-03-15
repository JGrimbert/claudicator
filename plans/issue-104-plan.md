Je vais d'abord lire les fichiers concernés pour comprendre l'état actuel avant de modifier quoi que ce soit.
**Étape 1** — Créer `src/lib/types/symbols.ts`
**Étape 2** — `ArtifactViewer.svelte` : remplacer `SymRow` par `SymbolEntry`, enrichir les champs, simplifier `keywords()`
**Étape 3** — `SymbolsView.svelte` : `SymbolEntry` comme base + prop `extraContext`
Maintenant mettre à jour le corps de `doSearch` pour utiliser `enriched` :
**Étape 4** — `AgentConsole.svelte` : passer `extraContext` à `SymbolsView`
**Étape 5** — Refonte complète de `AgentInput.svelte`
Tout est implémenté. Voici un récapitulatif des 6 changements :

---

**Étape 1** — `src/lib/types/symbols.ts` (nouveau)
- Type `SymbolEntry` canonique avec `key`, `file`, `startLine`, `score`, `role`, `summary`

**Étape 2** — `ArtifactViewer.svelte`
- Suppression de `type SymRow` local → import `SymbolEntry`
- `loadSymbols` enrichit chaque entrée avec `startLine` et `score`
- `keywords()` simplifiée : suppression de la liste stopwords locale (gérée côté serveur)

**Étape 3** — `SymbolsView.svelte`
- Import `SymbolEntry`, `SearchResult` étendu depuis `SymbolEntry` (+ `endLine`, `codeSnippet`, `snippetError`)
- Prop `extraContext: string = ""` ajoutée
- `doSearch` construit une query enrichie avec `extraContext.slice(0, 300)`

**Étape 4** — `AgentConsole.svelte`
- `<SymbolsView>` reçoit `extraContext={$agentState.issue?.body ?? ''}` → query alignée sur `ArtifactViewer`

**Étape 5** — `AgentInput.svelte` (refonte)
- Suppression des 3 `.prompt-row` avec badges flottants
- Un seul `.doc-scroll` avec sections `doc-sec`
- INPUT : `hasPlan = true` → `<pre class="plan-md">`, sinon `<textarea>` éditable
- Sections PLAN / DOCUMENTATION / ATLAS toggleables avec boutons `▾`/`▸` inline
- Toggle plan déplacé dans le footer (`.plan-toggle-row` avec `margin-right: auto`)