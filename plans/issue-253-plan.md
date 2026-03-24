Maintenant regardons `searchMethods` dans `cartography.ts` pour comprendre le scoring :
Voyons `run/+server.ts` pour voir les commentaires existants :
Voyons quelles routes existent et leurs commentaires :
Le diagnostic est confirmé : `atlas/+server.ts` (`GET`) et `atlas/generate/+server.ts` (`POST`) ont des commentaires avec "Atlas" mais ne scorent pas. La solution est claire — implémentons le scoring par chemin + commentaire dans `atlas.ts` :
Maintenant mettre à jour le `return` pour utiliser `totalEntries` :
Vérifions le fichier final :
C'est propre. Voici ce que fait la solution :

**`findRelevantRoutes` — logique de scoring :**
- **Score 1** : tokens de la query (3+ chars) présents dans les segments de chemin du dossier. Ex. `atlas` dans `/api/atlas/generate` → +1
- **Score 2** : tokens de la query présents dans le **commentaire JSDoc de tête de fichier**. Ex. `atlas` dans `/** Atlas — retourne... */` → +1
- Si score > 0 : inclus dans les Points d'entrée avec le chemin comme "symbole" et la description du commentaire

**Pour issue #253 "useAtlas" :**
- `/api/atlas` → score 2 (`atlas` dans chemin + commentaire)
- `/api/atlas/generate` → score 2 (`atlas` dans chemin + commentaire)
- `/api/agent/run` → score 0 (ni "atlas"/"prompt" dans chemin ni commentaire) → non inclus, normal

**Règle générale :** tout fichier route dont le chemin ou le commentaire de tête mentionne un terme de l'issue remonte automatiquement — sans avoir besoin d'extraire une fonction nommée dans l'index.