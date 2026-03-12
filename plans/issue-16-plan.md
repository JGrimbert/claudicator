Je vais commencer par lire tous les fichiers concernés pour avoir une vue complète avant de modifier quoi que ce soit.
Je vais lire le fichier TaskList.svelte complet, puis commencer les modifications en parallèle.
J'ai maintenant lu tous les fichiers. Je vais implémenter les modifications en parallèle, en commençant par les variables CSS dans `+layout.svelte`, puis en migrant tous les composants.
Maintenant TopBar et ItemRow en parallèle :
Maintenant ItemRow.svelte en parallèle :
Maintenant AgentInput et RunConsole :
Maintenant RunConsole.svelte :
Maintenant IssueAnalysis (le plus complexe, avec Mermaid) :
Maintenant mettre à jour le thème Mermaid (valeurs hex dans le JS pour Mermaid) :
Maintenant IssueList.svelte :
Maintenant TaskList.svelte (CSS uniquement, à partir de la ligne 781) :
Maintenant les 4 derniers composants :
Maintenant AgentConsole.svelte (le grand) :
Maintenant ArtifactViewer.svelte :
Dernier composant : DiagramViewer.svelte :
Maintenant je vais faire tous les edits restants en batch :
Il reste aussi `.dv-num` qui utilise encore `#9181f9` :
Migration complète. `DiagramViewer.svelte` est maintenant entièrement migré. Voici le récapitulatif de ce qui a été fait :

- `.dv-copy-btn` border → `var(--border-strong)`, hover → `var(--accent-hover)` / `var(--accent)`
- `.dv-prog` background → `var(--border)`
- `.dv-legend` border-top → `var(--border)`, background → `var(--bg-deep)`
- `.dv-tree` scrollbar → `var(--scrollbar)`
- `.dv-row:hover` → `var(--bg-panel)`
- `.dv-methods-block` → `var(--bg-deep)` / `var(--border)`
- `.dv-mrow:hover` → `var(--bg-panel)`
- `.dv-mrow.active` → `var(--bg-subtle)`, `.dv-msig` → `var(--accent-hover)`
- `.dv-mdot` border → `var(--border-strong)`
- `.dv-toggle:hover` → `var(--accent-hover)`
- `.dv-snippet` border → `var(--border)`, background → `var(--bg-deep)`
- `.dv-snippet-header` border → `var(--border)`, background → `var(--bg-panel)`
- `.dv-snippet-close:hover` → `var(--accent-hover)`
- `.dv-pre` background → `var(--bg-deep)`, scrollbar → `var(--scrollbar)`
- `.dv-num` → `var(--accent-hover)`

La migration des 11 composants + layout est terminée. Toutes les couleurs codées en dur sont remplacées par les variables CSS définies dans `:root`.