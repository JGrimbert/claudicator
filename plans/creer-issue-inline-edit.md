# Plan — Création et édition inline d'issue dans ArtifactViewer

## 1. Analyse du problème

### État actuel
- **Création d'issue** : formulaire dans `IssueList.svelte` (panneau bas), activé par "+" dans `IssuesTodoPanel`
- **Visualisation** : `ArtifactViewer` affiche le titre (`<h2>`) et le corps (`<pre>`) en lecture seule
- **Aucune édition inline** n'existe

### Comportement cible
- **Création** : la première "row" de l'artefact est directement le formulaire de création quand aucune issue n'est sélectionnée — titre cliquable/editable, description cliquable/editable
- **Édition issue existante** : clic sur le titre → mode édition du titre ; clic sur la description → mode édition de la description
- **Indicateur visuel d'édition** : highlight fin (bordure `var(--accent)`) sur les boutons ✓ et ✕ uniquement — le style du texte reste inchangé

---

## 2. Localisation des usages

| Fichier | Usage concerné |
|---|---|
| `src/lib/components/ArtifactViewer.svelte` | Affichage titre/description, zone de création → **modifications principales** |
| `src/lib/components/IssueList.svelte` | Formulaire `creating` + `openCreate()` → **à supprimer** |
| `src/lib/components/IssuesTodoPanel.svelte` | Bouton "+" qui appelle `openCreate()` → **à changer** |
| `src/lib/server/services/github.ts` | Appels octokit → **ajouter `updateIssue`** |
| `src/routes/api/issue/+server.ts` | Route issue unique → **ajouter PATCH** |

---

## 3. Stratégie de remplacement

### Flux création (aucune issue sélectionnée)
```
$agentState.issue === null
  → ArtifactViewer affiche "row création"
      title: <input> (placeholder "Titre de l'issue…")
      body: <textarea> (placeholder "Description…")
      ✓ → POST /api/issues → issue créée → select dans agentState + reload IssueList
      ✕ → vider les champs
```

Le bouton "+" dans `IssuesTodoPanel` est modifié pour **déselectionner l'issue courante** (`agentState.issue = null`), ce qui ramène automatiquement ArtifactViewer en mode création.

### Flux édition (issue sélectionnée)
```
Clic sur <h2> titre  → editingTitle = true → <input> pré-rempli
Clic sur <pre> body  → editingBody  = true → <textarea> pré-remplie
  ✓ → PATCH /api/issue { number, title?, body? } → update GitHub + agentState
  ✕ → reset editTitle / editBody, editingTitle / editingBody = false
```

Les boutons ✓/✕ apparaissent dans le `panel-header` quand `editingTitle || editingBody || creating`.

---

## 4. Étapes de modification du code

### Étape A — Serveur : `updateIssue` dans github.ts
Ajouter la fonction après `createIssue` :
```ts
export async function updateIssue(
    owner: string, repo: string, number: number,
    changes: { title?: string; body?: string }
) {
    const { data } = await octokit.issues.update({
        owner, repo, issue_number: number, ...changes
    });
    return data;
}
```

### Étape B — Route : PATCH dans `/api/issue/+server.ts`
```ts
export async function PATCH({ request }) {
    const { number, title, body } = await request.json();
    if (!number) return json({ error: "number manquant" }, { status: 400 });

    const owner = getCurrentProject()?.owner ?? "";
    const repo  = getCurrentProject()?.repo  ?? "";

    const issue = await updateIssue(owner, repo, number, {
        ...(title !== undefined ? { title } : {}),
        ...(body  !== undefined ? { body  } : {}),
    });
    return json({ number: issue.number, title: issue.title, body: issue.body ?? "" });
}
```

### Étape C — ArtifactViewer.svelte : état édition/création

**Nouveaux états** :
```ts
let editingTitle = false;
let editingBody  = false;
let editTitle    = "";
let editBody     = "";
let saveError    = "";
let saving       = false;

// Création (aucune issue)
let newTitle = "";
let newBody  = "";
let createError = "";
let createLoading = false;
```

**Démarrer édition** :
```ts
function startEditTitle() {
    editTitle = $agentState.issue?.title ?? "";
    editingTitle = true;
}
function startEditBody() {
    editBody = $agentState.issue?.body ?? "";
    editingBody = true;
}
function cancelEdit() {
    editingTitle = false;
    editingBody  = false;
    saveError = "";
}
async function save() {
    if (!$agentState.issue || saving) return;
    saving = true;
    try {
        const res = await fetch("/api/issue", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                number: $agentState.issue.number,
                ...(editingTitle ? { title: editTitle } : {}),
                ...(editingBody  ? { body:  editBody  } : {}),
            })
        });
        const data = await res.json();
        if (data.error) { saveError = data.error; return; }
        agentState.update(s => ({
            ...s,
            issue: s.issue ? { ...s.issue, title: data.title, body: data.body } : s.issue
        }));
        editingTitle = false;
        editingBody  = false;
    } finally {
        saving = false;
    }
}
```

**Template — header avec boutons ✓/✕** :
```html
<div class="panel-header">
    {#if $agentState.navigationStack.length > 0}
        <button class="back-btn" onclick={navigateBack}>…</button>
    {/if}
    <span>Artefact</span>
    {#if editingTitle || editingBody}
        <div class="edit-actions">
            <button class="edit-btn edit-btn--confirm" onclick={save} disabled={saving} title="Valider">✓</button>
            <button class="edit-btn edit-btn--cancel"  onclick={cancelEdit} title="Annuler">✕</button>
        </div>
    {/if}
</div>
```

**Template — zone contenu** :
```html
{#if $agentState.issue?.body !== undefined}
    <div class="issue-body">
        <!-- Titre -->
        {#if editingTitle}
            <input class="edit-inline" bind:value={editTitle} />
        {:else}
            <h2 class="issue-title" onclick={startEditTitle}>
                #{$agentState.issue.number} — {$agentState.issue.title}
            </h2>
        {/if}

        <!-- Corps -->
        {#if editingBody}
            <textarea class="edit-inline edit-inline--body" bind:value={editBody}></textarea>
        {:else}
            <pre class="body-text" onclick={startEditBody}>{$agentState.issue.body}</pre>
        {/if}

        {#if saveError}<span class="save-error">{saveError}</span>{/if}
        <!-- sub-issues inchangées -->
    </div>
{:else if $agentState.status === "loading"}
    <p class="hint blink">Chargement...</p>
{:else}
    <!-- Mode création -->
    <div class="create-row">
        <input class="edit-inline" placeholder="Titre de l'issue…" bind:value={newTitle} />
        <textarea class="edit-inline edit-inline--body" placeholder="Description…" bind:value={newBody} rows="4"></textarea>
        {#if createError}<span class="save-error">{createError}</span>{/if}
    </div>
{/if}
```

Boutons ✓/✕ dans le header aussi pour la création (`!$agentState.issue && newTitle.trim()`).

**CSS — boutons édition** :
```css
.edit-actions {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
}
.edit-btn {
    background: none;
    border: 1px solid var(--accent);   /* highlight fin */
    color: var(--accent);
    font-size: 0.7rem;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    opacity: 0.7;
    transition: opacity 0.15s;
}
.edit-btn:hover:not(:disabled) { opacity: 1; }
.edit-btn:disabled { opacity: 0.3; cursor: default; }
.edit-btn--cancel { border-color: #555; color: #555; }
.edit-inline {
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary);         /* style texte inchangé */
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1.4;
    width: 100%;
    resize: none;
}
.edit-inline--body {
    font-size: 0.78rem;
    font-weight: normal;
    color: var(--text-secondary);
    line-height: 1.6;
    min-height: 4rem;
}
/* curseur "editable" au survol des zones cliquables */
.issue-title, .body-text {
    cursor: text;
}
.issue-title:hover, .body-text:hover {
    background: rgba(255,255,255,0.02);
    border-radius: 3px;
}
```

### Étape D — IssueList.svelte : supprimer le formulaire de création
- Supprimer les variables `creating`, `newTitle`, `newBody`, `createError`, `createLoading`
- Supprimer les fonctions `openCreate`, `closeCreate`, `submitCreate`, `onTitleKey`
- Supprimer le bloc `{#if creating}…{/if}` du template
- Supprimer les styles `.create-form`, `.create-input`, `.create-body`, `.create-error`, `.create-actions`, `.btn-submit`, `.btn-cancel-sm`

### Étape E — IssuesTodoPanel.svelte : bouton "+" déselectionne l'issue
```ts
import { agentState } from "$lib/stores/agent";
// ...
function openCreate() {
    agentState.update(s => ({ ...s, issue: null, plan: null, status: "idle", navigationStack: [] }));
}
```
- Remplacer `issueListRef?.openCreate()` par `openCreate()`
- Supprimer `bind:this={issueListRef}` et la variable `issueListRef`
- Supprimer l'import `IssueList` du `bind:this` (garder l'import du composant)

---

## 5. Vérifications et nettoyage final

- [ ] Création : POST /api/issues fonctionne, l'issue apparaît dans IssueList après création
- [ ] Sélection après création : la nouvelle issue est sélectionnée dans agentState
- [ ] Édition titre : PATCH envoie uniquement `title`, agentState mis à jour
- [ ] Édition corps : PATCH envoie uniquement `body`, agentState mis à jour
- [ ] ✕ annule sans appel réseau
- [ ] Style texte identique en mode lecture et édition (pas de bordure visible sur l'input)
- [ ] Aucune régression sur la navigation (back button, sub-issues)
- [ ] `IssueList` n'a plus de formulaire résiduel
- [ ] Pas de double importation ou variable orpheline dans IssuesTodoPanel
