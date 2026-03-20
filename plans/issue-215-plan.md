Je vais lire les fichiers clés avant de commencer.
Maintenant je vais vérifier `TaskList.svelte` ligne 381 et la structure de `RunConsole.svelte`.
J'ai tout ce qu'il me faut. Je commence les modifications.
Maintenant `AgentConsole.svelte` — les modifications les plus importantes.
Suppression du bloc header ATLAS (lignes 221–247) :
Maintenant la branche de contenu : remplacer `codebase` → `atlas` avec le bouton Init, et ajouter l'onglet `console` :
Maintenant le CSS — supprimer `.projet-section` et `.header-actions`, ajouter `.atlas-init-bar` :
Vérifions le résultat final des fichiers modifiés :
Tout propre. Vérification rapide de la zone clé d'`AgentConsole.svelte` :
Tout est en place. Résumé des modifications effectuées :

---

**3 fichiers modifiés :**

**`AgentConsole.svelte`**
- Import `RunConsole` ajouté
- Header ATLAS (div `.projet-section` + bouton Init + cmdLogs) supprimé
- Onglet `"codebase"` → `"atlas"` (label `"ATLAS"`)
- Onglet `"console"` (label `"CONSOLE"`) ajouté après `"archi"`
- Branche `activeTab === "atlas"` : bouton Init + cmdLogs en barre, puis `<DiagramViewer />`
- Branche `activeTab === "console"` : `<RunConsole />`
- CSS `.projet-section` et `.header-actions` supprimés, `.atlas-init-bar` ajouté

**`+layout.svelte`**
- Import `ConsoleDrawer` supprimé
- `<ConsoleDrawer />` supprimé
- `padding-bottom: 26px` retiré du body

**`agent.ts`**
- Valeur par défaut de `consoleTab` : `"codebase"` → `"atlas"`