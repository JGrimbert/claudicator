Voici ce que je comprends : tu veux pouvoir afficher les méthodes avec Monaco dans le Panel Carto, sans passer par une task. Laissons-moi lire les fichiers clés.
Laissez-moi lire le serveur de méthodes pour les tâches pour comprendre la logique d'extraction de snippets.
Maintenant je vois clairement ce qu'il faut faire :

1. **Créer `/api/cartography/snippet/+server.ts`** — endpoint qui retourne le snippet d'une méthode par sa clé, sans filtrage SYMBOL MAP
2. **Modifier `DiagramViewer.svelte`** — rendre les méthodes cliquables + afficher Monaco en bas

Voici ce que je vais créer :
Maintenant, modifier `DiagramViewer.svelte` pour intégrer Monaco. Je vais ajouter un panneau Monaco en bas qui s'ouvre quand on clique sur une méthode.
Maintenant, modifier le template HTML pour rendre les méthodes cliquables et ajouter le panneau Monaco.
Maintenant je vais modifier la section template : rendre les méthodes cliquables et ajouter le panneau Monaco.
Maintenant ajouter les styles CSS pour le panneau Monaco.
Il y a une logique de rendu à corriger — le div Monaco ne doit pas être conditionnel sur `snippetData` sinon l'éditeur se recrée à chaque changement. Je corrige le template :
Vérifions le fichier complet pour s'assurer que tout est cohérent.
Il faut aussi disposer l'éditeur Monaco quand on ferme le panneau :
Bon. Résumons ce qui a été fait :

**Nouveau endpoint** : `/api/cartography/snippet?key=ClassName.methodName`
- Extrait le snippet d'une méthode depuis les fichiers sources sans passer par une task
- Réutilise la même logique d'extraction que `tasks/[id]/methods`

**DiagramViewer.svelte modifié** :
- Les méthodes dans l'arbre sont maintenant cliquables (rôle `button`)
- Click → fetch `/api/cartography/snippet?key=...` avec la clé construite depuis `nodeName.methodName`
- Un panneau Monaco s'ouvre en bas (hauteur 260px) avec le code source
- La méthode active est mise en évidence en violet
- Bouton ✕ pour fermer le panneau
- Réutilisation de l'éditeur existant si on change de méthode (pas de recréation)
- Fallback `<pre>` si Monaco CDN inaccessible

**Note** : La clé est construite comme `${node.name}.${m.sig.split("(")[0].trim()}` — si tu constates des "Méthode introuvable" c'est que la clé dans l'index a un format différent (possible si le nom de classe dans l'arbre ne correspond pas exactement à la première partie de la clé dans l'index). Dans ce cas il faudrait ajuster.