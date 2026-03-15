Maintenant je vais chercher le store agent pour vérifier le type `Issue`.
**Étape A — `updateIssue` dans github.ts**
**Étape B — PATCH dans `/api/issue/+server.ts`**
**Étape C — ArtifactViewer.svelte**

Script : ajout des états édition/création + fonctions.
Template : header avec boutons ✓/✕.
Template : zone contenu — édition inline + mode création.
CSS : ajouter les styles pour l'édition inline.
**Étape D — IssueList.svelte : supprimer le formulaire de création**
Supprimer le bouton ✕/+ dans le header et le bloc `{#if creating}` du template.
Supprimer les styles CSS du formulaire de création.
**Étape E — IssuesTodoPanel.svelte**
Implémentation complète. Voici le récapitulatif de ce qui a été fait :

---

**5 fichiers modifiés :**

| Fichier | Changement |
|---|---|
| `github.ts` | + `updateIssue(owner, repo, number, changes)` |
| `/api/issue/+server.ts` | + handler `PATCH` (appelle `updateIssue`) |
| `ArtifactViewer.svelte` | États édition/création, fonctions `startEditTitle/Body`, `cancelEdit`, `save`, `submitCreate` ; header avec ✓/✕ ; contenu inline éditable ; mode création quand `issue === null` |
| `IssueList.svelte` | Suppression complète du formulaire `creating` (variables, fonctions `openCreate/closeCreate/submitCreate/onTitleKey`, template, styles) |
| `IssuesTodoPanel.svelte` | "+" appelle maintenant `agentState.update(issue: null)` au lieu de `issueListRef.openCreate()` ; `bind:this` et `issueListRef` supprimés |

**UX :**
- **"+" dans la tab bar** → déselectionne l'issue → ArtifactViewer affiche les inputs titre/description
- **Issue sélectionnée** → clic sur le titre ou le corps → édition inline, style identique au mode lecture
- **Boutons ✓/✕** dans le header uniquement quand en mode édition ou quand un titre a été saisi en création