# Plan global — Intégration jgr-ui dans claudicator

**Objectif** : Faire de jgr-ui la source unique des fondamentaux UI dans claudicator.
Éliminer les duplications, étendre jgr-ui si nécessaire, sans réécrire la logique métier.

---

## 1. Analyse du problème

### État actuel

jgr-ui est déjà une dépendance de claudicator (`"jgr-ui": "file:../jgr-ui"`).
Cinq composants sont déjà importés et utilisés :

| Composant jgr-ui | Utilisé dans claudicator | Fichier |
|---|---|---|
| `JgrLayout` | Layout 3 colonnes | `+page.svelte:401` |
| `JgrTabs` | Onglets centre (roadmap/plan/cluster) | `+page.svelte:441` |
| `JgrCta` | Bouton "Lancer l'agent" | `AgentInput.svelte:355` |
| `JgrItem` | Items de la liste des tâches | `TaskList.svelte:4` |
| `JgrConsole` | Console de sortie de l'agent | `RunConsole.svelte:55` |

### Duplications et manques identifiés

1. **CSS variables du thème** — `+layout.svelte:15-30` définit les mêmes `:root` vars que `JgrTheme.svelte`
2. **Onglets custom dans AgentConsole** — `.todos-header` est une barre d'onglets propriétaire qui reproduit JgrTabs, mais avec un badge `count`
3. **JgrTabs sans support count** — JgrTabs ne supporte pas les badges de comptage (`{ id, label, count }`), ce qui bloque la migration de l'onglet ATLAS
4. **Listes dans IssueList, ProjetPanel** — à inspecter (potentiellement éligibles à JgrItem)
5. **Boutons secondaires** — `.cmd-btn`, `.back-btn`, `.doc-file-btn` sont des boutons custom non couverts par JgrCta

---

## 2. Localisation des usages

### Fichiers à modifier dans claudicator

| Fichier | Action |
|---|---|
| `src/routes/+layout.svelte` | Supprimer les CSS vars `:root` — les déléguer à JgrTheme |
| `src/lib/components/AgentConsole.svelte` | Remplacer `.todos-header` par JgrTabs (après extension) |
| `src/lib/components/IssueList.svelte` | Inspecter pour JgrItem |
| `src/lib/components/ProjetPanel.svelte` | Inspecter pour JgrItem |

### Fichiers à modifier dans jgr-ui

| Fichier | Action |
|---|---|
| `src/lib/components/JgrTabs.svelte` | Ajouter support optionnel `count` sur chaque tab |
| `src/lib/index.ts` | Vérifier les exports (déjà complet) |

---

## 3. Stratégie de remplacement

### Principe général

- **Priorité 1** : supprimer les duplications évidentes (CSS vars → JgrTheme)
- **Priorité 2** : étendre jgr-ui minimalement pour couvrir les besoins réels (JgrTabs + count)
- **Priorité 3** : migrer les listes si le mapping props est direct (pas de réécriture)
- **Ne pas migrer** : la logique métier complexe (AgentInput, ConsoleDrawer) — trop spécialisés

### Ce qu'on ne migre pas

- `AgentInput.svelte` vers `JgrPrompt` — AgentInput gère la construction du prompt, les toggles plan/doc/atlas, le mode spec/impl, le chargement de contexte. JgrPrompt est trop basique.
- `ConsoleDrawer.svelte` — La barre de statut globale est spécifique à claudicator (reconnexion, tokens, input inline). Pas de mapping direct dans jgr-ui.
- Les boutons `.cmd-btn`, `.back-btn` — Ce sont des boutons secondaires simples, pas des CTAs. JgrCta (avec flèche et spinner braille) n'est pas approprié ici.

---

## 4. Étapes de modification du code

### Étape 1 — jgr-ui : étendre JgrTabs pour supporter les counts

**Fichier** : `C:/jgr-ui/src/lib/components/JgrTabs.svelte`

Modifier le type des tabs pour accepter un `count` optionnel :

```diff
- tabs: { id: string; label: string }[];
+ tabs: { id: string; label: string; count?: number | string }[];
```

Afficher le count dans le bouton de l'onglet :

```diff
- >{tab.label}</button>
+ >{tab.label}{#if tab.count !== undefined && tab.count !== ''}<span class="tab-count"> {tab.count}</span>{/if}</button>
```

Ajouter le style pour `.tab-count` :

```css
.tab-count {
  font-size: 0.5rem;
  opacity: 0.55;
  margin-left: 0.4em;
}
```

**Impact** : non-breaking, le champ `count` est optionnel — les usages existants de JgrTabs dans claudicator ne changent pas.

Rebuilder jgr-ui :
```bash
cd C:/jgr-ui && npm run package
```

---

### Étape 2 — claudicator : activer JgrTheme dans +layout.svelte

**Fichier** : `C:/claudicator/src/routes/+layout.svelte`

Ajouter l'import :
```svelte
import { JgrTheme } from 'jgr-ui';
```

Wrapper le contenu dans `<JgrTheme>` :
```svelte
<JgrTheme>
    {@render children()}
    <ConsoleDrawer />
</JgrTheme>
```

Supprimer du bloc `<style>` :
- Les variables `:root` (toutes couvertes par JgrTheme)
- Le reset `*, *::before, *::after`
- Les styles `:global(body)` basiques (couverts par JgrTheme)
- Les styles scrollbar webkit (couverts par JgrTheme)

**Garder dans +layout.svelte** (spécifique claudicator, absent de JgrTheme) :
```css
:global(body) {
    padding-bottom: 26px; /* ConsoleBar height — spécifique claudicator */
}
```

**Vérification** : JgrTheme et +layout.svelte ont exactement les mêmes variables (confirmé ligne par ligne). La variable `--color-impl: cornsilk` est déjà dans JgrTheme.

---

### Étape 3 — claudicator : migrer les onglets ATLAS vers JgrTabs

**Fichier** : `C:/claudicator/src/lib/components/AgentConsole.svelte`

Après l'étape 1 (JgrTabs supporte `count`), remplacer le markup custom :

```diff
- import { JgrTabs } from 'jgr-ui'; // si pas déjà importé
```

Remplacer le bloc `.todos-header` + rendu conditionnel par `<JgrTabs>` :

```svelte
<JgrTabs
    tabs={tabs}
    activeTab={activeTab}
    onchange={id => activeTab = id}
>
    {#snippet children(tab)}
        <!-- contenu existant selon tab actif -->
    {/snippet}
</JgrTabs>
```

Le type `TabDef` actuel (`{ id, label, count }`) est directement compatible avec le type JgrTabs étendu.

Supprimer du `<style>` :
- `.tab`, `.tab:hover`, `.tab-active`, `.tab-todo`, `.tab-count`
- `.todos-header`, `.todos-header::-webkit-scrollbar`

**Note** : Les onglets ATLAS ont un comportement `overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none` — le style `.tab-bar` de JgrTabs devra peut-être être étendu pour supporter ce cas ou claudicator overridera avec un style scoped sur le wrapper.

---

### Étape 4 — claudicator : inspecter IssueList et ProjetPanel pour JgrItem

Lire `IssueList.svelte` et `ProjetPanel.svelte`. Vérifier si les items ont la structure compatible avec JgrItem :
- `title` : libellé principal
- `prefix` : badge/icône à gauche
- `labels` : badges colorés
- `state` : état visuel
- `actionLabel` : bouton d'action

Si le mapping est direct → remplacer par `JgrItem`.
Si les composants ont trop de logique custom (icônes d'état, handlers complexes) → ne pas migrer.

---

### Étape 5 — jgr-ui : rebuild et vérification du package

```bash
cd C:/jgr-ui
npm run package
```

Vérifier que `dist/index.js` et `dist/index.d.ts` sont bien générés et incluent les types `JgrTabs` étendus.

---

## 5. Vérifications et nettoyage final

### Checklist fonctionnelle

- [ ] Thème visuel identique après migration JgrTheme (couleurs, fonts, scrollbar)
- [ ] `padding-bottom: 26px` sur body toujours présent pour ConsoleDrawer
- [ ] Onglets ATLAS fonctionnels : navigation, badges count, scroll horizontal
- [ ] Onglets centre (+page.svelte) toujours fonctionnels (sans count — compatible car optionnel)
- [ ] Liste des tâches (JgrItem) inchangée
- [ ] Bouton "Lancer l'agent" (JgrCta) inchangé
- [ ] Console RunConsole (JgrConsole) inchangée

### Checklist build

- [ ] `npm run build` dans `C:/jgr-ui` sans erreur
- [ ] `npm run build` dans `C:/claudicator` sans erreur TypeScript
- [ ] Aucune importation de CSS var manquante dans les composants claudicator

### Nettoyage CSS

Après migration, supprimer de `AgentConsole.svelte` les classes CSS orphelines :
- `.tab`, `.tab-active`, `.tab-todo`, `.tab-count`, `.todos-header`

Après migration, supprimer de `+layout.svelte` les CSS vars `:root` et les resets globaux (délégués à JgrTheme).

### Régression à surveiller

- Les onglets ATLAS peuvent avoir `count = ""` — vérifier que JgrTabs ne rend pas un badge vide
- JgrTheme applique `overflow: hidden` sur `body` mais pas `padding-bottom` — si ConsoleDrawer est rogné, ajouter le padding en override

---

## Résumé des fichiers modifiés

| Fichier | Nature | Priorité |
|---|---|---|
| `C:/jgr-ui/.../JgrTabs.svelte` | Extension count optionnel | P1 |
| `C:/claudicator/.../+layout.svelte` | Déléguer thème à JgrTheme | P1 |
| `C:/claudicator/.../AgentConsole.svelte` | Migrer onglets ATLAS → JgrTabs | P2 |
| `C:/claudicator/.../IssueList.svelte` | Inspecter/migrer → JgrItem | P3 |
| `C:/claudicator/.../ProjetPanel.svelte` | Inspecter/migrer → JgrItem | P3 |
