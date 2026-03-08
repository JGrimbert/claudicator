# Project Diagram — claudicator
Generated: 2026-03-08

## Summary
- Methods: 5 | Described: 1 | Files: 4

## Roles
- helper (4): POST, GET, PATCH, DELETE
- internal (1): resetStaleTasks

## Modules
### src/ (1 methods)
  resetStaleTasks: resetStaleTasks()

### src\routes\api\tasks\[id]/ (2 methods)
  DELETE: DELETE({ params })
  PATCH: PATCH({ params, request })

### src\routes\api\tasks\[id]\plan/ (1 methods)
  GET: GET({ params })

### src\routes\api\tasks\[id]\revert/ (1 methods)
  POST: POST({ params })
