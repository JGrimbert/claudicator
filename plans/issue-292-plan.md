Je vois le problème. `.issue-body` a `padding: 1rem` et enveloppe les inputs en mode édition — alors que `.create-row` n'a pas de padding. C'est la divergence.

Fix : supprimer le padding de `.issue-body`, l'appliquer individuellement sur `.issue-title`, `.body-text` et `.sub-issues`. Les `.edit-inline` gardent leur propre padding interne et sont flush avec les bords dans les deux modes.
Résultat :
- `.issue-body` : plus de padding → les inputs/textareas touchent les bords dans les deux modes
- `.issue-title` et `.body-text` : padding appliqué directement sur eux (mode lecture)
- `.sub-issues` : padding horizontal ajouté pour cohérence
- Les `.edit-inline` (`padding: 0.5rem 1rem`) restent identiques → comportement uniforme édition/création