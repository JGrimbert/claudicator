# Skill : update-skill

Évalue si une session de travail apporte de l'expérience utile à enregistrer dans un skill de cluster, et met à jour (ou crée) le fichier concerné.

## Déclenchement

Invoquer **systématiquement** à la fin de :
- `tdd-issue`
- `repair-loop`
- toute session d'implémentation manuelle

## Couverture des clusters

| Fichier (préfixe ou exact) | Cluster |
|---|---|
| `src/lib/components/TaskList.svelte` | `cluster-task-workflow` |
| `src/lib/server/services/tasks.ts` | `cluster-task-workflow` |
| `src/routes/api/tasks/` | `cluster-task-workflow` |
| `src/lib/stores/agent.ts` | `cluster-agent-loop` |
| `src/routes/api/agent/` | `cluster-agent-loop` |
| `src/lib/components/AgentInput.svelte` | `cluster-agent-loop` |
| `src/lib/components/AgentConsole.svelte` | `cluster-agent-loop` |
| `src/lib/components/RunConsole.svelte` | `cluster-agent-loop` |
| `src/lib/components/ConsoleDrawer.svelte` | `cluster-agent-loop` |
| `src/lib/server/services/processes.ts` | `cluster-agent-loop` |
| `src/lib/server/services/claude-session.ts` | `cluster-agent-loop` |
| `src/lib/components/IssueList.svelte` | `cluster-issues-panel` |
| `src/lib/components/IssueAnalysis.svelte` | `cluster-issues-panel` |
| `src/lib/components/IssueGroups.svelte` | `cluster-issues-panel` |
| `src/lib/components/IssuesTodoPanel.svelte` | `cluster-issues-panel` |
| `src/lib/components/ItemRow.svelte` | `cluster-issues-panel` |
| `src/lib/server/services/github.ts` | `cluster-issues-panel` |
| `src/lib/server/agent/issue` | `cluster-issues-panel` |
| `src/routes/api/issues/` | `cluster-issues-panel` |
| `src/lib/server/agent/context.ts` | `cluster-context-atlas` |
| `src/lib/server/agent/prompt.ts` | `cluster-context-atlas` |
| `src/lib/server/agent/atlas.ts` | `cluster-context-atlas` |
| `src/lib/server/agent/segments.ts` | `cluster-context-atlas` |
| `src/lib/server/agent/skills.ts` | `cluster-context-atlas` |
| `src/lib/server/services/cartography.ts` | `cluster-context-atlas` |
| `src/routes/api/context/` | `cluster-context-atlas` |
| `src/routes/api/cartography/` | `cluster-context-atlas` |
| `src/routes/+page.svelte` | `cluster-ui-shell` |
| `src/routes/+layout.svelte` | `cluster-ui-shell` |
| `src/lib/components/ArtifactViewer.svelte` | `cluster-ui-shell` |
| `src/lib/components/PlanPanel.svelte` | `cluster-ui-shell` |
| `src/lib/components/ProjetPanel.svelte` | `cluster-ui-shell` |
| `src/lib/components/RoadmapViz.svelte` | `cluster-ui-shell` |
| `src/lib/components/DiagramViewer.svelte` | `cluster-ui-shell` |
| `src/lib/components/FullPlanView.svelte` | `cluster-ui-shell` |
| `src/lib/components/TodoList.svelte` | `cluster-ui-shell` |

## Protocole

### 1. Identifier les fichiers modifiés dans la session

```bash
git diff --name-only HEAD~1
```

Si plusieurs commits dans la session :

```bash
git log --oneline -5
git diff --name-only HEAD~N  # adapter N
```

### 2. Mapper vers les clusters

Utiliser le tableau ci-dessus. Un fichier peut appartenir à plusieurs clusters.
Lister les clusters touchés.

### 3. Évaluer la pertinence — filtre strict

Pour **chaque cluster touché**, répondre honnêtement à ces questions :

**Pitfall** : Y a-t-il eu une erreur inattendue liée à la structure du code ?
→ contrainte cachée, effet de bord, Svelte 5 gotcha, ordre d'opérations, race condition, typage trompeur, invariant non documenté...

**Pattern** : Un pattern réutilisable a-t-il émergé ou été confirmé ?
→ façon d'étendre une route, convention de nommage validée, structure de composant qui fonctionne bien...

**Leçon** : Y a-t-il quelque chose qui évitera une erreur dans une future issue ?
→ dépendance non évidente, comportement de build, contrainte d'env...

**Si la réponse est NON à toutes les trois → ne pas modifier le skill.** Ne pas écrire pour écrire.

### 4. Détecter les clusters émergents

Lancer :

```bash
git log --all --name-only --format="" | grep "^src/" | sort | uniq -c | sort -rn | head -40
```

Comparer avec la liste de couverture du tableau ci-dessus :
- Un fichier **> 10 touches** qui n'appartient à aucun cluster → **signaler à l'utilisateur**
- Un groupe de fichiers non couverts **qui évoluent ensemble** et totalisent > 20 touches → **proposer un nouveau cluster**

Pour créer un nouveau cluster : créer `.claude/commands/cluster-<nom>.md` en suivant exactement le template des clusters existants (Périmètre / Architecture / Protocole d'entrée / Expérience accumulée).

Mettre à jour la table de couverture dans **ce fichier** (`update-skill.md`).

### 5. Mettre à jour le(s) skill(s) concerné(s)

Ouvrir le fichier `.claude/commands/cluster-<nom>.md` avec `Read`, puis `Edit` pour :

- **Pitfalls connus** : ajouter un item `- [description concise du gotcha]`
- **Patterns validés** : ajouter un item `- [description du pattern]`
- **Leçons d'issues passées** : ajouter une ligne `| #N | YYYY-MM-DD | [leçon] |`

Ne modifier que les sections **Expérience accumulée**. Ne pas réécrire Périmètre ou Architecture sauf si une erreur factuelle est détectée.

### 6. Rapport final

Résumer en 3-5 lignes :
- Clusters mis à jour (+ ce qui a été ajouté)
- Clusters touchés mais non mis à jour (+ pourquoi : pas de pitfall/pattern/leçon)
- Clusters émergents détectés (+ recommandation)
