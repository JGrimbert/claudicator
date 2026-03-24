Je vois que l'injection optimiste est déjà en place (ligne 213-216), mais il manque l'indicateur visuel de "en attente" sur l'item. Voyons ce que `ListItem` supporte dans jgr-ui.
`ListItem` n'a pas de `loading` natif au niveau item. Voyons comment le composant rend les items pour savoir ce qu'on peut utiliser.
Le problème est clair : `ListItem` n'a pas de `loading` natif au niveau item. La solution propre est d'ajouter `loading?: boolean` à jgr-ui, puis de l'utiliser dans `ProjetPanel.svelte`.

Voici le plan :
1. Ajouter `loading?: boolean` dans `JgrTabList.svelte` et `atlas-manifest.ts` (jgr-ui)
2. Afficher un `…` dans la position du bouton close quand `loading` est vrai
3. Dans `ProjetPanel.svelte`, setter `loading: true` sur l'issue pending
4. Rebuild jgr-ui
Maintenant j'ai tout ce qu'il faut. Voici les 3 fichiers à modifier :
Maintenant les deux blocs de rows — ajouter le spinner et corriger `tl-row--with-close` :
Maintenant ajouter la classe CSS `.tl-del-pending` :
Maintenant `atlas-manifest.ts` :
Maintenant `ProjetPanel.svelte` — setter `loading` sur l'issue pending :
Maintenant rebuild jgr-ui :
Build OK. Voici ce qui a été fait :

**jgr-ui (`JgrTabList.svelte` + `atlas-manifest.ts`)** :
- `loading?: boolean` ajouté à `ListItem`
- Quand `loading` est vrai et qu'il n'y a pas de `onclose` : affiche `<span class="tl-del tl-del-vis tl-del-pending">…</span>` dans la position du bouton close (toujours visible, non interactif, gris)
- `tl-row--with-close` activé aussi quand `loading` est vrai (pour que le bouton `→` se décale correctement)

**`ProjetPanel.svelte`** :
- `loading: $issueListPendingNumber === issue.number` sur chaque issue item
- `onclose` mis à `undefined` pour l'issue en attente (pour que le spinner s'affiche à la place du bouton ✕)

L'issue pending affiche donc un `…` gris à droite pendant que les retries GitHub tournent en arrière-plan. Quand GitHub confirme l'issue (ou retries épuisés), `issueListPendingNumber` repasse à `null`, le `…` disparaît, le bouton ✕ réapparaît.