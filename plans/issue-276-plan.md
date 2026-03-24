Maintenant, voyons ce que `loadGroups` reçoit du serveur :
Diagnostic clair.

**Le `body` est bien présent** dans la réponse du GET `/api/issues/groups` — ligne 30 et 33 : les `IssueRef` de `group.issues` et `s.issues` dans les subdivisions ont tous `body` peuplé via `issueBodyMap`.

Ensuite dans `IssueGroups.svelte`, `group.subdivisions` est envoyé tel quel (ligne 195) : `subStacks: group.subdivisions ?? []`. Les objets `IssueRef` contiennent donc bien `{ number, title, body }`.

**Conclusion** : les ATLAS per-stack bénéficient bien des `body` des issues. Le scoring symbolique fonctionne à plein régime. Pas de problème à corriger côté frontend.