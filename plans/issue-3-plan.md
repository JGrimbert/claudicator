⚙ Agent Explorer les composants de navigation
⚙ Read C:/claudicator/src/routes/+page.svelte
⚙ Glob src/lib/components/**/*.svelte
⚙ Read C:/claudicator/.cache/project-diagram.md
⚙ Read C:/claudicator/src/lib/components/TopBar.svelte
⚙ Read C:/claudicator/src/lib/components/ArtifactViewer.svelte
⚙ Read C:/claudicator/src/lib/components/IssueList.svelte
⚙ Read C:/claudicator/src/lib/components/AgentConsole.svelte
⚙ Read C:/claudicator/src/lib/components/RunConsole.svelte
⚙ Read C:/claudicator/src/lib/components/TaskList.svelte
⚙ Read C:/claudicator/src/lib/components/IssueAnalysis.svelte
⚙ Read C:/claudicator/src/lib/components/AgentInput.svelte
⚙ Read C:/claudicator/src/lib/components/ItemRow.svelte
⚙ Read C:/claudicator/src/lib/components/DiagramViewer.svelte
⚙ Read C:/claudicator/src/lib/components/ProjectSettings.svelte
Voici le plan détaillé :

---

## Plan : Volets de navigation réductibles (style JetBrains)

### 1. Analyse du problème

L'application utilise une mise en page 3 colonnes dans `src/routes/+page.svelte` :

- **Gauche** (`aside`) : ArtifactViewer + IssueList, largeur 180–600px
- **Centre** (`main`) : contenu principal, flexible
- **Droite** (`section`) : TaskList, largeur 200–600px

Les volets latéraux sont toujours ouverts et redimensionnables. Il n'existe aucun mécanisme pour les réduire.

**Comportement cible (JetBrains IDE) :**
- Une bande verticale fixe (≈36px) toujours visible contenant des onglets avec titres à 90°
- Cliquer un titre ouvre/ferme le panneau correspondant dans la zone redimensionnable
- En mode fermé : la colonne redimensionnable disparaît, le handle de redimensionnement est désactivé
- Chaque onglet correspond à une vue (ex. : "ArtifactViewer", "Issues", "Tasks")

---

### 2. Localisation des usages

**Fichiers à modifier :**

| Fichier | Raison |
|---|---|
| `src/routes/+page.svelte` | Layout principal, gestion des widths, drag handlers |
| `src/lib/stores/agent.ts` | Ajout des états collapsed pour les volets |

**Constantes impactées dans `+page.svelte` :**
```ts
const LIMITS = { aside: [180, 600], section: [200, 600] }
// → les limites ne s'appliquent plus quand le volet est fermé

let widths = { aside: 300, section: 250 }
// → à compléter avec : collapsed: { aside: false, section: false }
```

**CSS impacté :**
- `.handle` (dividers horizontaux) → `pointer-events: none` quand fermé
- `aside` et `section` → `width: 0` quand fermé
- Nouveau `.panel-strip` pour la bande verticale

---

### 3. Stratégie

Pas de migration de données (ajout de nouvel état). Les valeurs `widths.aside` et `widths.section` existantes en localStorage sont conservées et réutilisées à la réouverture.

**Ajout en localStorage :**
```
claudicator:panel-collapsed  →  { aside: false, section: false }
```

**Architecture de la bande (strip) :**

```
[strip gauche 36px] | [aside 0–600px] | [handle] | [centre] | [handle] | [section 0–600px] | [strip droite 36px]
```

La bande est **toujours présente**, indépendante du volet ouvert/fermé. Elle contient des boutons avec le titre du volet tourné à 90°.

---

### 4. Étapes de modification du code

#### Étape 1 — Stocker l'état collapsed

Dans `src/routes/+page.svelte`, ajouter :

```ts
// État collapsed (persisté)
let collapsed = { aside: false, section: false }
const COLLAPSED_KEY = 'claudicator:panel-collapsed'

// Chargement au démarrage
onMount(() => {
  // ... chargements existants ...
  const savedCollapsed = localStorage.getItem(COLLAPSED_KEY)
  if (savedCollapsed) collapsed = JSON.parse(savedCollapsed)
})

function toggleCollapse(panel: 'aside' | 'section') {
  collapsed[panel] = !collapsed[panel]
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed))
}
```

#### Étape 2 — Désactiver le drag quand fermé

Dans `startDrag(e, panel)` :

```ts
function startDrag(e: MouseEvent, panel: 'aside' | 'section') {
  if (collapsed[panel]) return  // ← bloquer le resize
  // ... logique existante ...
}
```

#### Étape 3 — Modifier le layout HTML

Structure actuelle :
```
<aside> ... </aside>
<div class="handle"> ... </div>
<main> ... </main>
<div class="handle"> ... </div>
<section> ... </section>
```

Structure cible :
```
<!-- Bande gauche -->
<div class="panel-strip panel-strip--left">
  <button on:click={() => toggleCollapse('aside')}>
    <span class="strip-label">ArtifactViewer</span>
  </button>
  <button on:click={() => toggleCollapse('aside')}>
    <span class="strip-label">Issues</span>
  </button>
</div>

<!-- Volet gauche (caché si collapsed.aside) -->
{#if !collapsed.aside}
<aside style="width: {widths.aside}px"> ... </aside>
<div class="handle" on:mousedown={e => startDrag(e, 'aside')}> ... </div>
{/if}

<main> ... </main>

<!-- Volet droit (caché si collapsed.section) -->
{#if !collapsed.section}
<div class="handle" on:mousedown={e => startDrag(e, 'section')}> ... </div>
<section style="width: {widths.section}px"> ... </section>
{/if}

<!-- Bande droite -->
<div class="panel-strip panel-strip--right">
  <button on:click={() => toggleCollapse('section')}>
    <span class="strip-label">Tasks</span>
  </button>
</div>
```

#### Étape 4 — CSS de la bande verticale

```css
.panel-strip {
  width: 36px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 4px;
  background: var(--surface-1);
  border-right: 1px solid var(--border);  /* ou border-left pour droite */
  z-index: 10;
}

.panel-strip button {
  all: unset;
  cursor: pointer;
  padding: 6px 0;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-strip button:hover {
  background: var(--surface-hover);
}

/* Titre rotaté à 90° */
.strip-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);  /* lecture de bas en haut */
  font-size: 11px;
  letter-spacing: 0.5px;
  white-space: nowrap;
  color: var(--text-muted);
}

/* Titre actif (volet ouvert) */
.panel-strip button.active .strip-label {
  color: var(--accent);
  font-weight: 600;
}

.panel-strip--left {
  border-right: 1px solid var(--border);
}

.panel-strip--right {
  border-left: 1px solid var(--border);
}
```

#### Étape 5 — Indicateur visuel de l'état actif

Le bouton dans la bande reçoit la classe `.active` si le volet correspondant est ouvert :

```svelte
<button
  class:active={!collapsed.aside}
  on:click={() => toggleCollapse('aside')}
>
```

#### Étape 6 — Gestion du volet gauche multi-vues

Le volet gauche contient deux vues (ArtifactViewer + IssueList). Deux options :

- **Option A** (simple) : un seul bouton "Gauche" dans la bande → toggle de tout le volet
- **Option B** (avancée, style JetBrains) : deux boutons distincts dans la bande, chacun affiche sa vue dans le volet gauche

**Recommandation : Option A en première implémentation**, Option B en amélioration future.

---

### 5. Vérifications et nettoyage final

**Régressions à vérifier :**

| Scénario | Vérification |
|---|---|
| Resize quand volet ouvert | Les handles doivent toujours fonctionner normalement |
| Resize quand volet fermé | `startDrag` retourne immédiatement, aucune interaction |
| localStorage au rechargement | État collapsed correctement restauré |
| Largeur sauvegardée | Réouverture d'un volet → même largeur qu'avant fermeture |
| Layout fluide | Le centre prend bien tout l'espace quand les deux volets sont fermés |
| Touch/resize window | Aucune interaction entre resize fenêtre et état collapsed |

**Nettoyage :**
- Supprimer toute référence aux `LIMITS` pour le panel collapsed dans `startDrag`
- S'assurer que `onMove` ne peut pas s'activer sur un volet fermé (vérification dans `onUp` aussi)

**Test manuel recommandé :**
1. Fermer volet gauche → centre s'élargit
2. Fermer volet droit → centre s'élargit encore
3. Fermer les deux → seules les deux bandes restent
4. Rouvrir → largeurs restaurées, contenu intact
5. Recharger la page → état conservé

---

**Résumé des fichiers modifiés :** `src/routes/+page.svelte` uniquement (state + HTML + CSS). Aucun composant enfant à modifier.