# Plan : Onglet "{ contexte }" — Scroll continu des snippets

## 1. Analyse du problème

L'interface actuelle sépare :
- la **liste des symboles** (MethodsViewer dans la colonne droite) — affichage liste + Monaco single avec sélection
- la **zone Carto** (AgentConsole dans la zone bas-centre) — cartographie, recherche, TODO

La demande est d'ajouter un onglet `{ contexte }` dans le header "Carto" d'`AgentConsole`, qui affiche tous les snippets de la task sélectionnée **en défilement continu** (stacked Monaco), avec :
- séparateurs visuels entre fichiers (fond sombre + chemin) et entre symboles (fond très sombre + signature)
- coût estimé en tokens (nb total de caractères / 4)

Le store `planModeTask` (`{ id, title } | null`) reflète déjà la task sélectionnée dans TaskList.

---

## 2. Localisation des usages

| Fichier | Ligne | Rôle |
|---|---|---|
| `src/lib/components/AgentConsole.svelte` | 273 | Header "Carto" — y ajouter le toggle onglet |
| `src/lib/components/AgentConsole.svelte` | 272–327 | Section projet + agent-wrapper — à masquer si onglet actif |
| `src/lib/components/MethodsViewer.svelte` | 46–122 | Logique Monaco + chargement méthodes — pattern à réutiliser |
| `src/lib/stores/agent.ts` | 54 | `planModeTask` = `{ id, title } | null` — task sélectionnée |
| `src/routes/api/tasks/[id]/methods/+server.ts` | — | Endpoint → `{ methods: MethodSnippet[] }` |

---

## 3. Stratégie

Pas de modification de MethodsViewer (il reste dans TaskList, non cassé).

**Nouveau composant** : `src/lib/components/ContextViewer.svelte`
- Reçoit `taskId: string` en prop
- Charge les méthodes via `/api/tasks/${taskId}/methods`
- Affiche les snippets en scroll continu (N éditeurs Monaco indépendants)
- Gère `onDestroy` pour disposer tous les éditeurs

**Modification d'AgentConsole** :
- Lire `planModeTask` depuis le store
- Ajouter un bouton-onglet `{ contexte }` dans le header "Carto"
- Si actif → monter `ContextViewer`, masquer le reste (section projet + agent-wrapper)

---

## 4. Étapes de modification du code

### Étape 4.1 — Créer `ContextViewer.svelte`

**Props :**
```ts
export let taskId: string;
```

**Logique :**
```ts
interface MethodSnippet {
    key: string; file: string; startLine: number; endLine: number;
    snippet: string; signature: string; role: string | null; description: string | null;
}

let methods: MethodSnippet[] = [];
let loading = true;
let error: string | null = null;
let editors: any[] = [];  // instances Monaco

// Groupement par fichier (pour les séparateurs)
$: byFile = (() => {
    const map: Record<string, MethodSnippet[]> = {};
    for (const m of methods) {
        if (!map[m.file]) map[m.file] = [];
        map[m.file].push(m);
    }
    return Object.entries(map);
})();

// Coût tokens
$: totalChars = methods.reduce((s, m) => s + m.snippet.length, 0);
$: tokenEstimate = Math.ceil(totalChars / 4);
```

**Chargement (onMount) :**
- `fetch(/api/tasks/${taskId}/methods)` → peupler `methods`
- Charger Monaco si pas déjà chargé (`window.monaco` ou via CDN)
- Après `tick()`, initialiser N éditeurs via une Svelte `action` ou une boucle sur les refs

**Technique Monaco multi-instances :**

Utiliser une action Svelte pour initialiser chaque éditeur dans son conteneur :
```ts
function monacoAction(node: HTMLElement, snippet: MethodSnippet) {
    const monaco = (window as any).monaco;
    const lineCount = snippet.snippet.split('\n').length;
    node.style.height = Math.min(Math.max(lineCount, 3), 80) * 18 + 'px';
    const ed = monaco.editor.create(node, {
        value: snippet.snippet,
        language: getLanguage(snippet.file),
        readOnly: true,
        theme: 'vs-dark',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        lineNumbers: 'on',
        renderLineHighlight: 'none',
        overviewRulerLanes: 0,
        folding: false,
        glyphMargin: false,
        lineDecorationsWidth: 4,
        lineNumbersMinChars: 3,
        scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
        wordWrap: 'off',
    });
    editors.push(ed);
    return { destroy() { ed.dispose(); } };
}
```

**Template HTML :**
```html
<!-- Header : nb symboles + coût tokens -->
<div class="cv-header">
    <span>{methods.length} symboles</span>
    <span class="cv-tokens">~{tokenEstimate} tokens ({totalChars} cars)</span>
</div>

<!-- Scroll continu -->
<div class="cv-scroll">
    {#each byFile as [file, items]}
        <!-- Séparateur fichier -->
        <div class="cv-file-sep">
            <span class="cv-file-path">{file}</span>
        </div>

        {#each items as m}
            <!-- Séparateur symbole -->
            <div class="cv-sym-sep">
                <span class="cv-sig">{m.signature}</span>
                {#if m.role}<span class="cv-role">{m.role}</span>{/if}
                {#if m.description}<span class="cv-desc">{m.description}</span>{/if}
            </div>

            <!-- Éditeur Monaco -->
            {#if monacoLoaded && !monacoError}
                <div use:monacoAction={m} class="cv-editor-wrap"></div>
            {:else}
                <pre class="cv-fallback">{m.snippet}</pre>
            {/if}
        {/each}
    {/each}
</div>
```

**Styles clés :**
```css
.cv-scroll     { overflow-y: auto; flex: 1; }
.cv-file-sep   { background: #111; padding: 5px 12px; border-top: 1px solid #222;
                  color: #444; font: 0.62rem 'JetBrains Mono', mono; letter-spacing: 0.05em; }
.cv-sym-sep    { background: #0f0f0f; padding: 3px 12px 3px 20px; border-top: 1px solid #1a1a1a;
                  display: flex; align-items: center; gap: 8px; }
.cv-sig        { color: #666; font: 0.65rem 'JetBrains Mono', mono; }
.cv-role       { color: #3a3a5e; font-size: 0.58rem; border: 1px solid #2a2a40;
                  padding: 0 4px; border-radius: 2px; }
.cv-desc       { color: #3d3d3d; font-size: 0.62rem; font-style: italic; }
.cv-header     { display: flex; justify-content: space-between; padding: 4px 12px;
                  border-bottom: 1px solid #1a1a1a; flex-shrink: 0; }
.cv-tokens     { color: #333; font: 0.62rem mono; }
.cv-editor-wrap { min-height: 54px; }
```

---

### Étape 4.2 — Modifier `AgentConsole.svelte`

**Ajouter en import :**
```ts
import { planModeTask } from "$lib/stores/agent";
import ContextViewer from "$lib/components/ContextViewer.svelte";
let showContext = false;
```

**Modifier le header "Carto" (ligne 273) :**
```diff
- <div class="section-header">Carto</div>
+ <div class="section-header">
+     <span>Carto</span>
+     {#if $planModeTask}
+         <button
+             class="tab"
+             class:tab-active={showContext}
+             onclick={() => showContext = !showContext}
+         >{"{"}contexte{"}"}</button>
+     {/if}
+ </div>
```

**Conditionner l'affichage :**
```diff
+ {#if showContext && $planModeTask}
+     <div class="cv-panel">
+         <ContextViewer taskId={$planModeTask.id} />
+     </div>
+ {:else}
    <!-- section projet + agent-wrapper existants -->
    ...
+ {/if}
```

**Si `planModeTask` passe à null → reset showContext :**
```ts
$: if (!$planModeTask) showContext = false;
```

**Styles additionnels dans AgentConsole :**
```css
.cv-panel { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.section-header { display: flex; align-items: center; justify-content: space-between; }
```

---

## 5. Vérifications et nettoyage

- [ ] Sélectionner une task → l'onglet `{ contexte }` apparaît dans le header Carto
- [ ] Cliquer `{ contexte }` → la section projet et l'agent-wrapper sont masqués, ContextViewer monté
- [ ] Les N snippets s'affichent en scroll continu sans erreur Monaco
- [ ] Chaque Monaco est en read-only, taille ajustée au nb de lignes (pas de scroll interne)
- [ ] Séparateurs fichier (fond #111) et symbole (fond #0f0f0f) visibles entre les sections
- [ ] Le coût en tokens est affiché dans le header du ContextViewer
- [ ] Désélectionner la task → onglet `{ contexte }` disparaît, `showContext` reset à false
- [ ] `onDestroy` dans ContextViewer : tous les éditeurs Monaco sont disposés
- [ ] MethodsViewer dans TaskList : toujours fonctionnel (non modifié)
- [ ] Pas de double chargement du CDN Monaco (guard `if (window.monaco)` déjà en place)
- [ ] Re-sélectionner une autre task → ContextViewer se recharge (réactivité via `taskId` prop)
