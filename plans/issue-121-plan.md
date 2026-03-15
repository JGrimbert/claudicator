Maintenant je regarde `PlanPanel.svelte` pour comprendre le pattern UI existant.
Je lis la partie clusters de PlanPanel.svelte depuis le fichier sauvegardé.
`/api/skills` existe déjà (registre statique). Il faut adapter : les proposals iront sur `/api/skills/proposals` et le service s'appellera `skill-proposals.ts`.
Maintenant je modifie `PlanPanel.svelte`. J'insère les variables et la fonction dans le `<script>`, puis le bouton + affichage dans le template.
Maintenant je modifie le `onMount` pour charger les skills au démarrage.
Maintenant j'ajoute le bouton + affichage dans le template, entre `{/each}` et `{/if}` de la section COALESCENCE.
Maintenant j'ajoute les styles CSS. Je vais trouver la fin du fichier pour voir où insérer.
Implémentation terminée. Voici le résumé des 4 artefacts créés/modifiés :

---

**Nouveaux fichiers :**

| Fichier | Rôle |
|---|---|
| `src/lib/server/services/skill-proposals.ts` | Types `SkillProposal`, persistance `.agent/skills/proposals.json`, `buildPrompt`, `parseHaikuResponse`, `invokeHaiku` |
| `src/routes/api/skills/generate/+server.ts` | `POST` — fetch clusters → filtre (coal ≥6, hist ≥9 && count≥3) → déduplique → haiku × N → sauvegarde |
| `src/routes/api/skills/proposals/+server.ts` | `GET` — lit les proposals sauvegardées |

**Fichier modifié :**

`PlanPanel.svelte` — bouton "Générer les skills" dans la section COALESCENCE + affichage compact (titre · badge sém/git · description).

**Note :** `/api/skills` existait déjà (registre statique), j'ai donc utilisé `/api/skills/proposals` pour les proposals générées, et `skill-proposals.ts` comme nom de service pour éviter la collision avec `agent/skills.ts`.