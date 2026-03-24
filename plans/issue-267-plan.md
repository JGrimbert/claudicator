J'ai toutes les infos. Je démarre l'implémentation.

**Étape 1** — `groups/+server.ts` : ajouter `body` dans les issues des groupes.
**Étape 2** — `atlas.ts` : ajouter `writeAtlasForIssues`.
**Étape 3** — Nouveau `stack-plan-full/+server.ts`.
**Étape 4** — `IssueGroups.svelte` : type, state, fonction, bouton.
Maintenant le bouton dans `group-footer` — uniquement pour les groupes avec subdivisions :
Ajouter le style `.btn-full-plan` dans la section `<style>` :
Vérification rapide que tout est cohérent :
Pas de script de type-check. Je vérifie manuellement les imports et la cohérence.
Tout est en place. Récapitulatif des changements :

**4 fichiers modifiés / créés :**

1. **`groups/+server.ts`** — enrichit chaque issue des groupes (et subdivisions) avec `body` via un `Map` construit à partir de `getIssuesWithBodies`.

2. **`atlas.ts`** — nouvelle fonction `writeAtlasForIssues(issues, label)` : concatène les queries de toutes les issues pour un scoring symbolique élargi, écrit un ATLAS.md dédié au groupe.

3. **`stack-plan-full/+server.ts`** (nouveau) — reçoit `{ groupKeyword, subStacks, residualIssues }` avec bodies, appelle `writeAtlasForIssues`, construit un prompt `useAtlas` structuré par sous-stack, timeout 180s, sauvegarde dans `.agent/tasks/stack-full-{keyword}-{ts}.plan.md`.

4. **`IssueGroups.svelte`** — type `IssueRef` avec `body?`, `fullStackState`, fonction `planFullStack`, bouton "⚡ Plan complet" dans le footer des groupes qui ont des subdivisions.