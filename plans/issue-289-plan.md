Maintenant je vais lire les sections précises de `TaskList.svelte` pour implémenter les changements.
Maintenant je dois voir la partie "implement" pour fullPlan et comprendre la structure du panel au-dessus. Laisse-moi chercher le slot d'implémentation fullplan et les variables réactives liées.
Maintenant regardons `FullPlanView.svelte` qui est le composant de la scène principale pour fullPlan :
Laisse-moi comprendre comment le panneau implement est structuré pour les fullPlan, et où se situe le composant parent :
Maintenant les CSS de l'arbre fp-tree :
Maintenant je comprends bien la structure. Laisse-moi lire les variables d'état et la zone de reset dans selectTask :
J'ai tout ce qu'il faut pour implémenter les 6 changements. Je vais procéder par ordre logique.
**Étape 1 — État + fonction + reset**
Maintenant reset dans les deux endroits de `selectTask` :
**Étape 2 — Modifier le snippet issueRow**
**Étape 3 — Remplacer fp-root-row par fp-issue-panel avec CTA**
**Étape 4 — CSS**
Maintenant étendre la ligne verticale du premier groupe vers le haut (jusqu'au panel) et ajuster l'indentation des enfants :
Ajuster l'indentation des enfants (`.fp-children` et `.fp-child-row`) :
Ajouter le style `.is-selected` sur `.issue-status-row` et adapter `.is-reprompt-btn` dans le badge :
Adapter `.is-reprompt-btn` quand il est dans un badge :
Vérification rapide que tout est cohérent :
CSS `.is-sandbox-btn` est orphelin, je le supprime :
Vérification finale que le fp-issue-panel et le snippet sont cohérents :
Tout est en place. Récapitulatif des 6 changements implémentés :

---

**Ce qui a changé dans `TaskList.svelte` :**

1. **Panel issue au-dessus de l'arbre** (`fp-issue-panel`) — remplace le label `[ Plan complet — task ]` supprimé. Affiche `#N titre` + description (3 lignes max, chargées via `/api/issue?number=N`) quand une row est sélectionnée. Placeholder `— sélectionnez une issue` au repos.

2. **CTA `↓ tester`** dans ce panel — désactivé par défaut, actif dès qu'une row avec patch est sélectionnée. Bascule en `↩` si le patch est déjà appliqué.

3. **Clic sur la row** → `selectIssueRow(row)` (sans déclencher quand on clique sur un `button` ou `.is-badge` grâce au `.closest()`). Row sélectionnée reçoit la classe `.is-selected` (légère surbrillance cornsilk).

4. **Badge patch restructuré** : `patch ↺ ✕` — le bouton ↺ est maintenant intégré dans le badge via `.is-in-badge` (sans bordure, hérite de la couleur), suivi de ✕.

5. **Label racine supprimé** — `fp-root-row` retiré. La ligne verticale du premier groupe est prolongée de 6px vers le haut (`fp-group:first-child::before`) pour atteindre visuellement le panel.

6. **Indentation plus prononcée** — `--sub-x` passe de `10px` à `18px`, `padding-left` de `8px` à `12px` sur `.fp-children`, connecteurs ajustés (`-12px` / `12px`).