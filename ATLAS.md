# Atlas — Claudicator
_Généré pour : Issue #312 — Refacto TaskDetail.svelte_

## Points d'entrée (issue #312)

Ces symboles ont été identifiés comme pertinents :

| Symbole | Fichier | Signature |
|---|---|---|
| `deleteTask` | `src/lib/server/services/tasks.ts` | `deleteTask(id)` |
| `getTask` | `src/lib/server/services/tasks.ts` | `getTask(id)` |
| `createTask` | `src/lib/server/services/tasks.ts` | `createTask(data)` |
| `/api/cartography/comment` | `src/routes/api/cartography/comment/+server.ts` | `GET, POST` — Cartographie — génère un commentaire pour une méthode via Claude (POST) |
| `/api/cartography/enrich` | `src/routes/api/cartography/enrich/+server.ts` | `POST` — Cartographie — enrichit les descriptions de méthodes via Claude (POST) |
| `/api/cartography/methods` | `src/routes/api/cartography/methods/+server.ts` | `GET` — Cartographie — liste les méthodes indexées avec métadonnées (GET) |
| `DiagramViewer` | `src/lib/components/DiagramViewer.svelte` | `startCommentAgent, toggleSection` — composant UI |
| `AgentConsole` | `src/lib/components/AgentConsole.svelte` | `getFiles` — composant UI |

---

## Snippets

### `deleteTask`
_src/lib/server/services/tasks.ts_

```ts
function deleteTask(id: string): boolean {
    const p = taskPath(id);
    if (!fs.existsSync(p)) return false;
    fs.unlinkSync(p);
    return true;
}
```

### `getTask`
_src/lib/server/services/tasks.ts_

```ts
function getTask(id: string): Task | null {
    const p = taskPath(id);
    if (!fs.existsSync(p)) return null;
    return migrateTaskStatus(JSON.parse(fs.readFileSync(p, "utf-8")));
}
```
