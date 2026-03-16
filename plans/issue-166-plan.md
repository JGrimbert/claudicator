Voyons les composants Jgr existants pour bien comprendre la structure avant de proposer quelque chose.
Voyons les usages HTML concrets de ces boutons.
J'ai toutes les infos. Voici mon analyse :

---

## Analyse : faisabilité et pertinence

**Faisabilité : OUI**
- Les 3 patterns sont génériques, utilisent les design tokens de jgr-ui (`var(--accent)`, `var(--bg-panel)`, etc.)
- `.back-btn` est dupliqué dans 2 fichiers — preuve que c'est un pattern, pas du code spécialisé
- Un composant `JgrBtn` est trivial à créer

**Pertinence : OUI**
- `back` = navigation retour, applicable partout
- `cmd` = bouton action/toggle avec état actif, applicable à tout panneau de commandes
- `file` = sélecteur de fichier monospace, applicable à tout explorateur

**Ce qu'on ne fait pas :** étendre `JgrCta` — ce composant a une sémantique CTA (flèche →, spinner) incompatible avec des boutons secondaires discrets.

**Plan :** créer `JgrBtn` dans jgr-ui avec `variant: 'back' | 'cmd' | 'file'` + prop `active` pour le toggle, puis migrer les 4 usages dans claudicator.

---

Je commence l'implémentation.
Tout est clair. Je crée `JgrBtn.svelte` puis migre les 4 usages.
Maintenant la migration dans `AgentConsole.svelte`. Lire les sections d'import et les 3 usages pour faire les éditions précises.
Maintenant supprimer les blocs CSS devenus inutiles dans `AgentConsole.svelte`.
Maintenant `ArtifactViewer.svelte`.
Vérifions qu'il ne reste plus aucun résidu de ces classes.
Propre. Vérifions que le build passe.
Il faut rebuilder jgr-ui pour générer le dist avec `JgrBtn`.
Build réussi sans erreur. Récapitulatif de ce qui a été fait :

---

## Résultat

### `JgrBtn` — nouveau composant dans jgr-ui

**3 variantes** :
- `back` — bouton navigation retour (border, couleur accent, hover bg-border)
- `cmd` — bouton commande/toggle (bg-panel, muted, état `active` avec accent, `disabled`)
- `file` — sélecteur fichier monospace (border subtile, hover accent)

**Props** : `variant`, `active`, `disabled`, `title`, `onclick` + content via slot (Svelte 5 snippet `{@render children()}`)

### Migrations dans claudicator

| Fichier | Avant | Après |
|---|---|---|
| `AgentConsole.svelte` | `<button class="back-btn">` | `<JgrBtn variant="back">` |
| `AgentConsole.svelte` | `<button class="cmd-btn" class:active>` | `<JgrBtn variant="cmd" {active}>` |
| `AgentConsole.svelte` | `<button class="doc-file-btn">` | `<JgrBtn variant="file">` |
| `ArtifactViewer.svelte` | `<button class="back-btn">` | `<JgrBtn variant="back">` |

Les 3 blocs CSS (`.cmd-btn`, `.back-btn`, `.doc-file-btn`) ont été supprimés des deux fichiers — plus aucune duplication.