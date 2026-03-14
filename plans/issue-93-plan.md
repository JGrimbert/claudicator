Maintenant je vais lire les routes API existantes et les composants UI.
**Phase 1 — segments.ts**
**Phase 2 — skills.ts**
**Phase 3 — context.ts + prompt.ts**
Maintenant `prompt.ts` — ajout du type `Skill` et de la section `SKILL` :
**Phase 4 — orchestrator.ts**
Maintenant, ajout du mode orchestré dans `/api/agent/run/+server.ts` :
**Phase 5 — /api/atlas, AtlasView.svelte, onglet Atlas**
Maintenant, ajout de l'onglet Atlas dans `+page.svelte` :
Toutes les 5 phases sont implémentées. Voici un récapitulatif de ce qui a été créé/modifié :

---

**Fichiers créés (8)**

| Fichier | Rôle |
|---|---|
| `src/lib/server/agent/segments.ts` | Classification sémantique des fichiers → région |
| `src/lib/server/agent/skills.ts` | Registre des 6 skills + `selectSkill()` |
| `src/lib/server/agent/orchestrator.ts` | Coordinateur multi-agents parallèles |
| `src/routes/api/skills/+server.ts` | `GET /api/skills` → registre complet |
| `src/routes/api/atlas/+server.ts` | `GET /api/atlas` → fichiers classifiés + skills |
| `src/lib/components/AtlasView.svelte` | Vue des régions avec fichiers + skill associée |

**Fichiers modifiés (4)**

| Fichier | Changement |
|---|---|
| `src/lib/server/agent/context.ts` | Détecte les régions du symbolMap, sélectionne la skill, l'injecte dans le prompt |
| `src/lib/server/agent/prompt.ts` | Nouvelle section `SKILL` (label / focus / contraintes) dans le prompt |
| `src/routes/api/agent/run/+server.ts` | Mode `orchestrated: true` → appelle `orchestrator.ts` |
| `src/routes/+page.svelte` | Onglet "atlas" dans la barre centrale → `AtlasView` |

**Points clés :**
- `.agent/` est déjà dans `.gitignore` → `.agent/orchestrations/` couvert automatiquement
- Non-régression garantie : le mode one-shot existant est inchangé, `orchestrated` est opt-in
- `selectSkill()` retourne `full-stack` si plusieurs régions, skill ciblée si une seule, `domain` par défaut