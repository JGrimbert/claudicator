# CLAUDE.md

This file defines how Claude Code should behave when working on this repository.

The goal of this project is to build **Claudicator**, a local development orchestrator that manages interactions between:

* Git
* GitHub
* Claude Code
* a human developer

Claude should behave as a **planning and implementation assistant**, not as an autonomous agent.

---

# Core Principles

Claude must follow these principles when modifying this repository.

### 1. Claude plans, humans approve

Claude should generate:

* plans
* step breakdowns
* patches

But **never assume automatic execution of actions like commits or pushes**.

---

### 2. Every development action must be traceable

Plans must be stored in:

```
plans/
```

Example:

```
plans/issue-12-global.md
plans/issue-12-step-1.md
```

These files are part of the development history.

---

### 3. Claude should prefer patches over full rewrites

When implementing features, Claude should produce **diff-style patches** whenever possible.

Example:

```
diff --git a/file.ts b/file.ts
```

This allows the user to review changes before committing.

---

# Project Purpose

Claudicator is a **local development tool** that allows a developer to control how Claude interacts with a repository.

The application should support the following workflow:

```
GitHub Issue
      ↓
Global Plan
      ↓
Step Plan
      ↓
Patch Generation
      ↓
Human Review
      ↓
Commit / Push
```

Claude participates in:

* plan generation
* step planning
* code patch generation
* code review

Claude does **not directly control Git**.

---

# Project Architecture

```
src
│
├─ routes
│   └─ api
│
├─ lib
│   ├─ server
│   │
│   │   ├─ services
│   │   │   claude.ts
│   │   │   github.ts
│   │   │   git.ts
│   │   │
│   │   └─ agent
│   │       issue.ts
│
│   └─ components
```

Server-side logic must remain in:

```
src/lib/server
```

because it uses:

* fs
* child_process
* simple-git
* GitHub API

These modules must **never be bundled for the browser**.

---

# Agent State

Internal state is stored in:

```
.agent/
```

Example:

```
.agent
  issues/
  state.json
```

This directory contains:

* downloaded GitHub issues
* orchestration state

---

# GitHub Integration

GitHub interactions are handled through:

```
@octokit/rest
```

The required environment variable is:

```
GITHUB_TOKEN
```

The token must include:

```
repo
```

scope because the repositories may be private.

---

# Claude Integration

Claude is invoked through the **Claude Code CLI**.

Example implementation:

```ts
execSync(`claude "${prompt}"`)
```

Claude should be used for:

* plan generation
* step planning
* patch generation
* code review

---

# Development Rules

When modifying the codebase:

1. Prefer **small incremental changes**
2. Avoid large refactors unless requested
3. Maintain clear separation between:

    * UI
    * agent logic
    * external services
4. Ensure server code stays in `src/lib/server`

---

# Future Direction

Claudicator will eventually support:

* issue selection
* plan visualization
* step orchestration
* patch previews
* commit approval UI
* multi-repository workflows

Claude should prioritize **maintaining a clear agent-driven architecture**.

---

# Summary

Claude acts as:

* planner
* assistant
* code generator

The human developer remains responsible for:

* approving changes
* committing code
* controlling the workflow
