Maintenant je lis les sections exactes pour faire les modifications précises.
Maintenant je cherche la section des boutons dans le label "patch" des lignes d'étape.
J'ai tout ce qu'il me faut. Je fais les 4 groupes de modifications.
Maintenant le `#id` → cornsilk, titre → grisé :
Maintenant les boutons du badge "patch" — persistants, vert clair, hover blanc/vert-pale :
Voilà les 4 groupes de modifications appliquées :

**Hiérarchie visuelle** (du plus saillant au plus discret) :
- **Graph labels + arêtes pointillées** : `cornsilk` → `#e8e4d4` (blanc cassé chaud, même famille que cornsilk mais plus neutre)
- **`#id` des étapes** (`is-num`, `fp-issue-num`) : `#888` → `cornsilk` (devient l'élément mis en valeur)
- **Titre de l'issue** (`is-title`, `fp-issue-title`) : `var(--text)` → `#888` (grisé comme l'était le #id)

**Boutons du badge "patch"** :
- Plus d'`opacity: 0` → toujours visibles
- Couleur harmonisée en vert clair (`#4caf50` / `inherit` depuis is-ok)
- Hover → blanc verdâtre `#c8f5ca`