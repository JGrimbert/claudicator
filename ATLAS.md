# Atlas — Claudicator
_Généré pour : Issue #189 — Recherche étendue_

## Points d'entrée (issue #189)

Ces symboles ont été identifiés comme pertinents :

| Symbole | Fichier | Signature |
|---|---|---|
| `orchestrate` | `src/lib/server/agent/orchestrator.ts` | `orchestrate(task, projectRoot, description, onEvent)` |
| `buildContext` | `src/lib/server/agent/context.ts` | `buildContext(task, projectRoot, description, skillOverride)` |
| `parseIssueRefs` | `src/lib/server/services/git-history.ts` | `parseIssueRefs(message)` |

---

## Snippets

### `orchestrate`
_src/lib/server/agent/orchestrator.ts_

```ts
async function orchestrate(
    task:        Pick<Task, "id" | "title">,
    projectRoot: string,
    description: string | undefined,
    onEvent:     (event: SubAgentEvent) => void,
): Promise<OrchestrationResult> {
    const query = `${task.title}${description ? " " + description.slice(0, 250) : ""}`;

    // 1. Identifier les fichiers affectés et les grouper par segment
    const results = getSessionWithCode(query, projectRoot);
    const filesByRegion = new Map<SemanticRegion, string[]>();
    for (const r of results) {
        const region = classifyFile(r.file);
        if (region === "config" || region === "tests") continue;
        if (!filesByRegion.has(region)) filesByRegion.set(region, []);
        const files = filesByRegion.get(region)!;
        if (!files.includes(r.file)) files.push(r.file);
    }

    // Fallback : si aucun segment détecté, contexte complet mono-agent
    if (filesByRegion.size === 0) {
        onEvent({ segment: "merged", type: "system", payload: "[orchestrateur] aucun segment détecté — mode mono-agent" });
        const ctx = buildContext(task, projectRoot, description);
        onEvent({ segment: "merged", type: "done", payload: "" });
        return { segments: [], mergedPlan: ctx.prompt };
    }

    const conceptMap  = loadConceptMap(projectRoot) ?? undefined;
    const projectDocs = loadProjectDocs(projectRoot);

    // 2. Lancer N agents en parallèle (un par segment)
    const segmentEntries = [...filesByRegion.entries()];
    const segmentResults: OrchestrationSegment[] = [];

    await Promise.all(segmentEntries.map(async ([region, files]) => {
        const skill = selectSkill([region]);
        onEvent({
            segment: region,
            type: "system",
            payload: `[▶ ${region}] ${skill.label} — ${files.length} fichier(s)`,
        });

        const atlas = generateAtlasStrings(projectRoot, query)?.compressed;
        const minCtx = {
            task: { id: task.id, title: task.title },
            symbolMap: {},
            prompt: "",
            skill,
        };
        const prompt = formatPrompt(minCtx as any, { description, conceptMap, projectDocs, atlas, skill });

        try {
            const plan = await spawnClaudeOneShot(
                prompt,
                projectRoot,
                (text) => onEvent({ segment: region, type: "text",   payload: text }),
                (sys)  => onEvent({ segment: region, type: "system", payload: sys  }),
            );
            onEvent({ segment: region, type: "done", payload: "" });
            segmentResults.push({ region, skill, files, plan });
        } catch (err: any) {
            onEvent({ segment: region, type: "error", payload: err.message ?? String(err) });
        }
    }));

    // 3. Fusionner les plans par ordre de segment
    const order: SemanticRegion[] = ["domain", "infra", "api", "ui", "store", "tests"];
    segmentResults.sort((a, b) => order.indexOf(a.region) - order.indexOf(b.region));

    const mergedPlan = segmentResults
        .map(s => `## Segment : ${s.region} (${s.skill.label})\n\n${s.plan}`)
        .join("\n\n---\n\n");

    onEvent({ segment: "merged", type: "text", payload: mergedPlan });
    return { segments: segmentResults, mergedPlan };
}
```

### `buildContext`
_src/lib/server/agent/context.ts_

```ts
function buildContext(
    task: Pick<Task, "id" | "title">,
    projectRoot: string,
    description?: string,
    skillOverride?: Skill,
    atlasContent?: string
): AgentContext {
    const query     = buildQuery(task.title, description);
    const symbolMap = loadSymbolMap(projectRoot, query);

    // Détecter les régions touchées par la tâche à partir des fichiers du symbolMap
    const affectedFiles = Object.values(symbolMap).map(g => g.file ?? '').filter(Boolean);
    const regions = [...new Set(affectedFiles.map(f => classifyFile(f)))].filter(r => r !== 'config');
    const skill = skillOverride ?? (regions.length > 0 ? selectSkill(regions) : undefined);

    const ctx: AgentContext = {
        task: { id: task.id, title: task.title },
        symbolMap,
        prompt: "",
        skill,
    };

    const conceptMap  = loadConceptMap(projectRoot) ?? undefined;
    const projectDocs = loadProjectDocs(projectRoot);
    // Si atlasContent est fourni (même vide), on n'appelle pas generateAtlasStrings
    const atlas = atlasContent !== undefined
        ? (atlasContent.trim() || undefined)
        : generateAtlasStrings(projectRoot, query)?.compressed;
    ctx.prompt = formatPrompt(ctx, { description, conceptMap, projectDocs, atlas, skill });

    return ctx;
}
```
