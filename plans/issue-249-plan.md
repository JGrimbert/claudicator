Le problème est clair : si le toggle ATLAS est activé mais que `ATLAS.md` n'a pas encore été généré, le prompt le silencieux le passe. Il faut auto-générer avant le spawn.

Je vais extraire la logique en un module partagé et l'appeler automatiquement dans `run/+server.ts`.
Je vais créer un module partagé `atlas.ts` et l'utiliser dans `run/+server.ts` pour auto-générer si manquant.
Bien. Je crée `src/lib/server/agent/atlas.ts` avec la logique partagée, puis je mets à jour `generate/+server.ts` et `run/+server.ts`.
Maintenant je mets à jour `generate/+server.ts` pour utiliser ce module :
Maintenant je mets à jour `run/+server.ts` pour appeler `ensureAtlasMd` si le fichier est absent :
Vérifions que `path` et `fs` ne sont plus nécessaires pour ce bloc (ils restent utilisés ailleurs dans le fichier) :
`fs` et `path` restent utilisés dans `savePlan`, pas de nettoyage nécessaire. Vérifions le résultat final du bloc atlas dans `run/+server.ts` :
Tout est en ordre. Voici ce qui a été fait :

**3 fichiers modifiés :**

| Fichier | Changement |
|---|---|
| `src/lib/server/agent/atlas.ts` | **Nouveau** — `writeAtlasMd(task, description?)` + `ensureAtlasMd(task)` |
| `src/routes/api/atlas/generate/+server.ts` | Délègue à `writeAtlasMd`, plus de logique dupliquée |
| `src/routes/api/agent/run/+server.ts` | Appelle `ensureAtlasMd(task)` au lieu de juste lire le fichier |

**Comportement corrigé :**
- Toggle ATLAS **ON** + `ATLAS.md` absent → auto-généré (avec `task.title` comme query, sans GitHub)
- Toggle ATLAS **ON** + `ATLAS.md` présent → lu tel quel (inchangé)
- Toggle ATLAS **OFF** → aucun atlas (inchangé)

Le bouton "Générer l'Atlas" reste utile pour forcer une régénération avec la description GitHub (meilleurs points d'entrée), mais ce n'est plus un prérequis bloquant.