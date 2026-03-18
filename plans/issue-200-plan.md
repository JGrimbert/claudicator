Trouvé. La fonction `getIssues` (ligne 50) n'a pas de `per_page`, donc GitHub retourne 30 par défaut.
Corrigé. La fonction `getIssues` avait la limite par défaut de GitHub (30). Elle récupère maintenant jusqu'à 100 issues.

Si tu as plus de 100 issues ouvertes, il faudrait ajouter de la pagination — dis-moi si c'est le cas.