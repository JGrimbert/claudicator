Voici le plan complet pour la création de `jgr-ui`.

---

## Plan — Création du repo `jgr-ui`

### 1. Analyse du problème

**Situation actuelle :**  
Claudicator mélange dans ses composants Svelte :
- La logique métier (agent, tasks, issues, SSE)
- Le système de design (thème, layout, primitives UI)

Le résultat : les composants UI ne sont pas réutilisables hors de claudicator. La création d'un second projet (ex : un dashboard, une autre app) obligerait à tout réécrire.

**Objectif :**  
Extraire les fondamentaux UI dans un package indépendant `jgr-ui` (npm workspace ou lib publiable), que claudicator et d'autres projets pourront importer.

---

### 2. Localisation des usages

#### 2.1 Composants candidats à l'extraction

| Composant actuel | Candidat `jgr-ui` | Couplage métier à supprimer |
|---|---|---|
| `+layout.svelte` (variables CSS, scrollbar) | `JgrTheme` + `JgrLayout` | Supprimer `ConsoleDrawer` hardcodé dans layout |
| `+page.svelte` (3 colonnes resize) | `JgrColumns` | Supprimer toute la logique stores/tasks/issues |
| `CtaButton.svelte` | `JgrCta` | Supprimer `data-use-case` si claudicator-specific |
| `ConsoleDrawer.svelte` + `RunConsole.svelte` | `JgrConsole` | Supprimer refs directes à `agentRunState`, SSE → passer via props/events |
| `AgentInput.svelte` | `JgrPrompt` | Supprimer refs `globalPlanPrompt`, `contextState`, etc. |
| Système onglets dans `PlanPanel.svelte` + `+page.svelte` | `JgrTabs` | Supprimer logique métier (tasks, clusters) |
| `ItemRow.svelte` | `JgrItem` | Aucun — déjà assez générique |
| `TopBar.svelte` (slot titre) | `JgrTopBar` | Supprimer sélecteur projet, token usage |

#### 2.2 Ce qui reste dans claudicator

- Tous les stores (`agent.ts`, etc.)
- Toutes les routes API
- Les composants métier : `IssueAnalysis`, `TaskList`, `IssueList`, `PlanPanel`, `AgentConsole`, `ArtifactViewer`, `ClusterCodeView`, etc.
- L'intégration SSE (le **data** reste dans claudicator, seul le **rendu** passe dans `JgrConsole`)

---

### 3. Interface publique des composants `jgr-ui`

#### 3.1 `JgrLayout`
```
Layout : row topbar + 3 colonnes redimensionnables + footer fixed

Props :
  - leftWidth?: number (défaut 300)
  - rightWidth?: number (défaut 340)
  - storageKey?: string (pour localStorage)

Slots :
  - topbar
  - left
  - center
  - right
  - footer
```

#### 3.2 `JgrTabs`
```
Composant onglets avec liste + slot contenu

Props :
  - tabs: { id: string, label: string }[]
  - activeTab: string
  - on:change: (id: string) => void

Slot par onglet : <JgrTab id="xxx">...</JgrTab>
Support modal : prop `modal?: { title, content }` pour afficher dans une modale
```

#### 3.3 `JgrCta`
```
Bouton bleu avec spinner braille

Props :
  - label: string
  - pending?: boolean     → spinner actif
  - disabled?: boolean
  - variant?: 'primary' | 'ghost' | 'danger'
  - on:click
```

#### 3.4 `JgrItem` (interface module)
```
Ligne item avec états visuels

Props :
  - title: string
  - prefix?: string | number
  - labels?: string[]
  - state?: 'default' | 'hover' | 'selected' | 'pending'
  - actionLabel?: string
  - on:action
  - on:select
```

Note : `pending` active le spinner sur le CTA interne de la ligne.

#### 3.5 `JgrPrompt`
```
Zone de saisie prompt (remplace le plan)

Props :
  - value: string
  - placeholder?: string
  - sections?: { id: string, label: string, content: string, enabled?: boolean }[]
  - on:submit: (value: string) => void
  - on:change: (value: string) => void
  - pending?: boolean
```

#### 3.6 `JgrConsole`
```
Console SSE placeable dans n'importe quelle zone du layout

Props :
  - logs: { line: string, type: string }[]
  - running?: boolean
  - minimized?: boolean
  - showInput?: boolean
  - on:input: (text: string) => void
  - on:interrupt
  - on:toggle-minimize

Note : peut être fixée en bas via JgrLayout slot="footer", 
       ou placée dans une colonne (mode embedded)
```

#### 3.7 `JgrTheme`
```
Provider CSS variables (dark theme)

Props :
  - theme?: 'dark' | 'light' (défaut dark)

Expose :
  --bg-deep, --bg-base, --bg-panel, --bg-subtle
  --border, --border-strong
  --text-primary, --text-secondary, --text-muted, --text-dim
  --accent, --accent-hover
  --color-impl
  --scrollbar
  Font stack: Inter + JetBrains Mono
```

---

### 4. Étapes de création du repo `jgr-ui`

#### Étape 1 — Initialisation du repo
- Créer `C:/jgr-ui` (ou dossier choisi)
- `git init` + `npm init`
- Configurer SvelteKit en mode **library** (svelte-package)
- Configurer TypeScript
- Configurer `svelte.config.js` avec `@sveltejs/package`

**Structure cible :**
```
jgr-ui/
  src/
    lib/
      components/
        JgrLayout.svelte
        JgrTabs.svelte
        JgrCta.svelte
        JgrItem.svelte
        JgrPrompt.svelte
        JgrConsole.svelte
        JgrTheme.svelte
      index.ts         ← exports publics
  package.json
  svelte.config.js
```

#### Étape 2 — Créer `JgrTheme`
- Extraire toutes les variables CSS de `+layout.svelte` (lignes `:root {}`)
- Extraire reset scrollbar
- Extraire font declarations
- Tester : wrapper vide qui injecte le thème

#### Étape 3 — Créer `JgrCta`
- Copier `CtaButton.svelte` tel quel
- Supprimer `data-use-case` (ou le garder en prop optionnelle générique)
- Ajouter prop `variant`
- Écrire stories/exemples dans une page de démo `src/routes/demo/+page.svelte`

#### Étape 4 — Créer `JgrItem`
- Copier `ItemRow.svelte`
- Supprimer refs spécifiques claudicator
- Ajouter support état `pending` (active spinner interne)
- Tester dans la page démo

#### Étape 5 — Créer `JgrConsole`
- Fusionner `ConsoleDrawer.svelte` + `RunConsole.svelte`
- Supprimer tous les imports de stores (`agentRunState`, etc.)
- Remplacer par props + events
- Support mode `fixed` (bottom drawer) et mode `embedded`
- Le spinner braille reste dans le composant
- Tester : page démo avec logs fictifs

#### Étape 6 — Créer `JgrPrompt`
- Réécrire `AgentInput.svelte` sans stores
- Les sections (TASK/OBJECTIF/CONTRAINTES) deviennent des `sections[]` en props
- Les toggles docs/atlas deviennent des `sections[n].enabled`
- Event `on:submit` avec le texte final assemblé
- Tester dans page démo

#### Étape 7 — Créer `JgrTabs`
- Extraire la logique onglets de `+page.svelte` et `PlanPanel.svelte`
- Composant pur : liste de tabs + slot de contenu actif
- Support modale : slot optionnel `modal`
- Tester dans page démo

#### Étape 8 — Créer `JgrLayout`
- Extraire la logique 3 colonnes de `+page.svelte`
- Supprimer toute ref aux composants métier
- Garder : resize handles, localStorage, collapse strips
- Slot `footer` pour placer `JgrConsole` ou autre
- Tester dans page démo avec contenu fictif

#### Étape 9 — Créer `index.ts`
```ts
export { default as JgrTheme } from './components/JgrTheme.svelte';
export { default as JgrLayout } from './components/JgrLayout.svelte';
export { default as JgrTabs } from './components/JgrTabs.svelte';
export { default as JgrCta } from './components/JgrCta.svelte';
export { default as JgrItem } from './components/JgrItem.svelte';
export { default as JgrPrompt } from './components/JgrPrompt.svelte';
export { default as JgrConsole } from './components/JgrConsole.svelte';
```

#### Étape 10 — Build et publication locale
- `npm run package` → génère `/dist`
- Configurer `package.json` exports
- Tester import depuis claudicator via `file:../jgr-ui`

---

### 5. Migration dans Claudicator

#### Étape 11 — Ajouter la dépendance
- Dans `claudicator/package.json` : `"jgr-ui": "file:../jgr-ui"`
- `npm install`

#### Étape 12 — Migrer `+layout.svelte`
- Remplacer le bloc CSS `:root` + scrollbar par `<JgrTheme />`
- Garder le slot `ConsoleDrawer` ou le déplacer dans `JgrLayout`

#### Étape 13 — Migrer `CtaButton.svelte` → `JgrCta`
- Dans chaque composant qui importe `CtaButton`, remplacer par `JgrCta`
- Vérifier les props (renommages éventuels)
- Supprimer `CtaButton.svelte` de claudicator

#### Étape 14 — Migrer `ItemRow.svelte` → `JgrItem`
- Même processus
- Supprimer `ItemRow.svelte`

#### Étape 15 — Migrer la console
- Dans `ConsoleDrawer.svelte` : remplacer le rendu par `<JgrConsole>`
- Brancher les stores `agentRunState` sur les props de `JgrConsole`
- Les events `on:input` et `on:interrupt` appellent les API existantes
- Garder `ConsoleDrawer.svelte` comme wrapper mince claudicator-specific

#### Étape 16 — Migrer `AgentInput.svelte` → `JgrPrompt`
- Wrapper claudicator qui alimente les sections depuis les stores
- `on:submit` déclenche le lancement de l'agent

#### Étape 17 — Migrer `+page.svelte` → `JgrLayout`
- Remplacer la logique resize par `<JgrLayout>`
- Garder les composants métier dans les slots

---

### 6. Vérifications et nettoyage final

#### 6.1 Vérifications fonctionnelles
- [ ] La page principale de claudicator s'affiche identiquement
- [ ] Le redimensionnement des colonnes fonctionne (localStorage persist)
- [ ] La console SSE reçoit et affiche les logs en temps réel
- [ ] Le prompt s'assemble correctement (TASK/OBJECTIF/CONTRAINTES)
- [ ] Les boutons CTA montrent le spinner pendant `pending`
- [ ] Les items affichent les états hover/selected/pending

#### 6.2 Vérifications de régression
- [ ] Aucun import de `$lib/server` dans `jgr-ui` (pas de code serveur)
- [ ] Aucun store claudicator-specific dans `jgr-ui`
- [ ] Build `jgr-ui` sans erreur TypeScript
- [ ] Build `claudicator` sans erreur après migration
- [ ] Tous les tests manuels du workflow agent passent

#### 6.3 Nettoyage
- Supprimer de claudicator les fichiers migrés (`CtaButton.svelte`, `ItemRow.svelte`)
- Supprimer le CSS `:root` dupliqué dans `+layout.svelte`
- Documenter dans `jgr-ui/README.md` : liste des composants + props

---

### Résumé des livrables

| Livrable | Contenu |
|---|---|
| `jgr-ui` repo | 7 composants Svelte génériques + thème |
| Page démo `jgr-ui` | Showcase de tous les composants |
| Claudicator migré | Importe `jgr-ui`, logique métier préservée |
| `jgr-ui/index.ts` | API publique claire |