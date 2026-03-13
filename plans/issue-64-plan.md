Le fichier est déjà implémenté avec la structure 3-rows décrite. Voici ce que je confirme en lisant le code actuel :

- **Row INPUT** (l.252-276) : `TASK` + `DESCRIPTION` — deux `<textarea>` éditables avec `bind:value`
- **Row ENRICHISSEMENT** (l.279-291) : sections `OBJECTIF`, `CONTRAINTES`, etc. en `pre` read-only avec `max-height: 72px`
- **Row ATLAS** (l.293-310) : grille `grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))` avec les sous-sections
- **`buildFullPrompt()`** (l.73-83) : réassemble TASK + DESCRIPTION + toutes les sections avant envoi
- **Mode plan** (l.241-248) : textarea unique préservée quand `hasPlan = true`

La structure est cohérente avec `formatPrompt()` dans `prompt.ts` — les clés de parsing (`TOP_KEYS`, `ENRICH_KEYS`, `ATLAS_SUB_KEYS`) correspondent exactement aux sections produites par `formatPrompt`.

Y a-t-il quelque chose à modifier ou c'est une mise à jour de contexte ?