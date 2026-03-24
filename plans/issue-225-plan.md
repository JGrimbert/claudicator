Laisse-moi regarder le code pour comprendre pourquoi ça ne fonctionne pas.
Je vois que `consoleTab` est défini ligne 165 mais utilisé ligne 62. Cherchons où ce store est consommé dans les composants.
Le problème est dans `AgentConsole.svelte`. Voyons le fichier complet.
Le problème est clair : `let activeTab = $consoleTab` est initialisé une seule fois. Quand `consoleTab.set("console")` est appelé de l'extérieur, le store change mais `activeTab` ne se met pas à jour.

Voyons comment `activeTab` est utilisé dans le template.
Le bug est clair :

- Ligne 135 : `let activeTab = $consoleTab` — initialisé une fois, ne réagit plus aux changements externes du store
- Ligne 136 : `$: consoleTab.set(activeTab)` — synchro `activeTab` → store (sens unique)

Quand `startConsoleStream` appelle `consoleTab.set("console")`, le store change mais `activeTab` ne suit pas — et le rendu reste sur l'ancien onglet.

La correction : rendre `activeTab` réactif dans les deux sens.
**Cause** : `let activeTab = $consoleTab` ne capture la valeur du store qu'une seule fois à l'initialisation. Les appels externes à `consoleTab.set(...)` mettaient le store à jour mais `activeTab` ne bougeait pas.

**Correction** : `$: activeTab = $consoleTab` crée une déclaration réactive — à chaque changement du store (interne ou externe), `activeTab` est mis à jour, ce qui déclenche le rendu et bascule bien sur l'onglet "console".