# Claudicator Agent Architecture Guide

This document defines the internal workflow that Claude should follow when working on **Claudicator**, focusing on the **plan → step → patch → commit pipeline**.

Claude is the **planner and patch generator**, while the human developer approves and executes Git actions.

---

# 1️⃣ Workflow Overview

Claude should always follow this structured process:

```id="p6azk4"
1. Load issue context
2. Generate global plan
3. Break global plan into steps
4. For each step:
     a. Generate code patch (diff)
     b. Produce human-readable summary
5. Wait for human approval
6. Commit and push approved changes
```

> Important: Claude **never executes Git commands directly**. All commits are performed by the system after human review.

---

# 2️⃣ File Management

* `.agent/` stores internal state:

```id="1dp5bw"
.agent/
  issues/        ← downloaded issue data
  state.json     ← current workflow state
```

* `plans/` stores all plan files:

```id="1x6qfl"
plans/issue-12-global.md
plans/issue-12-step-1.md
```

* `patches/` stores generated code diffs (optional):

```id="0tyezo"
patches/issue-12-step-1.diff
```

Claude should reference these files in logs and outputs.

---

# 3️⃣ Plan Generation

For a selected issue:

1. Read the issue description from `.agent/issues/{issueNumber}.md`.
2. Generate a **global plan** in markdown format.
3. Commit the plan to Git on a branch named:

```id="8fgtwx"
issue-{issueNumber}-plan
```

---

# 4️⃣ Step Breakdown

1. Split the global plan into **atomic steps**.
2. Each step should have:

    * step number
    * action description
    * target files
    * expected changes
3. Save each step as:

```id="8x3wmt"
plans/issue-{issueNumber}-step-{n}.md
```

---

# 5️⃣ Patch Generation

For each step:

1. Generate a **diff-style patch** (or a code block) corresponding to the step.
2. Include:

    * target file path
    * lines added/removed
    * explanation in markdown
3. Save patch as:

```id="01frn7"
patches/issue-{issueNumber}-step-{n}.diff
```

---

# 6️⃣ Human Review

Before committing:

* Display patch and summary in the **Artifact Viewer**.
* Wait for developer approval.
* Only after approval, trigger commit and push.

---

# 7️⃣ Commit Guidelines

1. Create a dedicated branch for each plan/step:

```id="54nbwq"
issue-{issueNumber}-plan
issue-{issueNumber}-step-{n}
```

2. Commit messages should be:

```id="3jwxpe"
docs(plan): implementation plan for issue #12
feat(step): implement step 1 for issue #12
```

3. Keep commits small and traceable.

---

# 8️⃣ Logging and Console Output

Claude should generate logs in **Agent Console** for every action:

```id="9x3vwp"
[agent] loading issue #12
[agent] generating global plan
[agent] breaking plan into steps
[agent] generating patch for step 1
[agent] waiting for human approval
[agent] commit approved
[agent] pushed branch issue-12-step-1
```

Logs should always be clear and **human-readable**.

---

# 9️⃣ Best Practices

* Always produce **reviewable output first**.
* Keep steps **small and incremental**.
* Use `.md` files to store plans and patches for **traceability**.
* Never overwrite previous plans or steps.
* Respect human review at all times.

---

# 10️⃣ Summary

Claude’s responsibilities:

* plan generation
* step breakdown
* patch generation
* human-readable logging

Human developer responsibilities:

* approve patches
* commit and push code
* manage branches

Together, this ensures **safe semi-automated development** in Claudicator.
