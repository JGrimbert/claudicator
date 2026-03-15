Laisse-moi voir l'état actuel des fichiers modifiés.
Je dois lire les fichiers complets pour voir exactement ce qui est en place.
Les fichiers sont trop volumineux via les previews. Je vais cibler les sections clés.
Maintenant je lis les sections HTML clés des deux fichiers.
Je dois voir la section JS de PlanPanel pour identifier les variables manquantes.
Je dois voir les styles CSS dans PlanPanel pour vérifier lesquels sont définis.
Je dois voir le CSS de `.result-area` et la structure du `roadmap-inline` dans IssueAnalysis.
Je dois voir les fonctions `extractMermaid` et `textWithoutMermaid`.
Je dois voir la suite de `renderMermaid` pour comprendre le fallback.
Je cherche toutes les références résiduelles à `highlightedGroup` dans le template.
Maintenant j'ai tout ce qu'il me faut. Je prépare les corrections ciblées.
J'ai tout le contexte nécessaire. Je fais les corrections dans les deux fichiers.
Maintenant je corrige l'onglet "étape" (singulier) dans PlanPanel — ajout du résumé et des dépendances, et mise en forme du header.
Maintenant je mets à jour le CSS `.group-header` dans PlanPanel pour correspondre au nouveau layout flex avec index.
Vérifions qu'il n'y a pas d'erreurs TypeScript dans les deux fichiers.
Pas de script check. Je vérifie visuellement les zones modifiées.
Tout est en place. Voici ce qui a été corrigé :

**`IssueAnalysis.svelte`**
- `textWithoutMermaid` : supprime maintenant aussi les blocs `### Groupe N —` et tout ce qui suit. Quand le résultat est vide après nettoyage, affiche un message clair à la place du `<pre>` vide.
- ~117 lignes de CSS mort supprimées : `.groups-section`, `.groups-cards`, `.group-card`, `.group-header`, `.group-index`, `.group-name`, `.group-dep`, `.btn-group-tasks`, `.group-summary`, `.group-issues`, `.issue-chip` + variantes — tout ce qui appartenait à la groups-section supprimée.

**`PlanPanel.svelte`**
- Onglet **étape** (singulier) : le header montre maintenant l'index (`.step-index`) + le nom (`.group-title`) en flex row, avec `.step-summary` et `.step-dep` affichés si présents, puis les chips d'issues alignées à `1.65rem` pour cohérence avec les étapes cards.
- CSS `.group-header` mis à jour : `display: flex; align-items: center; border-bottom: 1px solid #111` — cohérent visuellement avec les cards de l'onglet "étapes".
- Nouvelle classe `.group-title` pour le nom du groupe dans ce contexte.