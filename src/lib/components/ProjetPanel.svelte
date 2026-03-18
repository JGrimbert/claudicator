<script lang="ts">
    import { onMount } from "svelte";
    import {
        agentState,
        projetPanelTab,
        notifyTaskCreated,
        issueListRefreshTick,
        type Issue,
    } from "$lib/stores/agent";
    import TaskList from "./TaskList.svelte";
    import { JgrTabList } from "jgr-ui";
    import type { ListItem, TabDef } from "jgr-ui";

    // ─── TODOS ────────────────────────────────────────────────────────────────

    type GrepResult = { file: string; line: number; content: string };

    let todos: GrepResult[] = [];
    let todosLoading = false;
    let todoActionPending = false;
    let todoCreating: Record<string, boolean> = {};
    let todoDone: Record<string, boolean> = {};

    function shortFile(path: string) {
        return path.split(/[\\/]/).pop() ?? path;
    }

    function todoTitle(content: string): string {
        return (
            content
                .trim()
                .replace(/^(\/\/|\/\*+)\s*TODO:?\s*/i, "")
                .replace(/\*\/\s*$/, "")
                .trim() || content.trim()
        );
    }

    async function loadTodos() {
        todosLoading = true;
        try {
            const res = await fetch("/api/cartography", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: "TODO" }),
            });
            const data = await res.json();
            todos = data.grepResults ?? [];
        } catch {
            /* silencieux */
        } finally {
            todosLoading = false;
        }
    }

    async function createTaskFromTodo(g: GrepResult) {
        const key = `${g.file}:${g.line}`;
        if (todoCreating[key] || todoDone[key]) return;
        todoCreating = { ...todoCreating, [key]: true };
        todoActionPending = true;
        try {
            const title = todoTitle(g.content).slice(0, 120);
            const match = g.content.match(/#(\d+)/);
            let issueNumber: number | undefined;
            if (match) {
                issueNumber = Number(match[1]);
            } else {
                const res = await fetch("/api/github/issues", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: title.slice(0, 80),
                        body: `Trouvé dans \`${g.file}:${g.line}\`\n\n\`\`\`\n${g.content.trim()}\n\`\`\``,
                    }),
                });
                const data = await res.json();
                if (data.number) issueNumber = data.number;
            }
            await fetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, issueNumber }),
            });
            todoDone = { ...todoDone, [key]: true };
            notifyTaskCreated();
        } catch {
            /* silencieux */
        } finally {
            todoCreating = { ...todoCreating, [key]: false };
            todoActionPending = false;
        }
    }

    // ─── ISSUES ───────────────────────────────────────────────────────────────

    let issues: Issue[] = [];
    let issuesLoading = false;
    let closingNums = new Set<number>();
    let closedNums = new Set<number>();

    function openCreate() {
        agentState.update((s) => ({
            ...s,
            issue: null,
            plan: null,
            status: "idle",
            navigationStack: [],
        }));
    }

    async function loadIssues() {
        if (!issues.length) issuesLoading = true;
        try {
            const res = await fetch("/api/issues");
            if (res.ok) issues = await res.json();
        } catch {
            /* silencieux */
        } finally {
            issuesLoading = false;
        }
    }

    async function closeIssue(n: number) {
        closingNums = new Set([...closingNums, n]);
        try {
            const res = await fetch(`/api/issues/${n}/close`, { method: "POST" });
            if (res.ok) {
                closedNums = new Set([...closedNums, n]);
                setTimeout(loadIssues, 800);
            }
        } finally {
            closingNums = new Set([...closingNums].filter((x) => x !== n));
        }
    }

    async function selectIssue(issue: Issue) {
        agentState.update((s) => ({
            ...s,
            issue: { ...issue, body: "", subIssues: [] },
            plan: null,
            status: "loading",
            navigationStack: [],
        }));
        const res = await fetch(`/api/issue?number=${issue.number}`);
        const full = await res.json();
        agentState.update((s) => ({
            ...s,
            issue: full,
            status: "idle",
            knownSubIssueNumbers: [
                ...new Set([
                    ...s.knownSubIssueNumbers,
                    ...(full.subIssues?.map((si: any) => si.number) ?? []),
                ]),
            ],
        }));
    }

    onMount(() => {
        loadTodos();
        loadIssues();
    });

    $: if ($issueListRefreshTick > 0) loadIssues();

    // ─── ITEMS ────────────────────────────────────────────────────────────────

    $: displayedIssues = issues.filter(
        (i) =>
            i.state === "open" &&
            !$agentState.knownSubIssueNumbers.includes(i.number)
    );

    $: todoItems = todos.map(
        (g): ListItem => ({
            id: `${g.file}:${g.line}`,
            label: todoTitle(g.content),
            prefix: `${shortFile(g.file)}:${g.line}`,
            actionLabel: "→ Task",
            actionLoading: todoCreating[`${g.file}:${g.line}`] ?? false,
            actionDone: todoDone[`${g.file}:${g.line}`] ?? false,
            onaction: () => createTaskFromTodo(g),
        })
    );

    $: issueItems = displayedIssues.map(
        (issue): ListItem => ({
            id: String(issue.number),
            label: issue.title,
            prefix: `#${issue.number}`,
            labels: issue.labels ?? [],
            onclose: {
                handler: () => closeIssue(issue.number),
                loading: closingNums.has(issue.number),
                done: closedNums.has(issue.number),
            },
        })
    );

    $: tabs = [
        {
            id: "todos",
            label: "TODO",
            items: todoItems,
            pending: todoActionPending,
            loading: todosLoading,
            empty: "Aucun TODO",
        },
        {
            id: "issues",
            label: "Issues",
            items: issueItems,
            selectedId: $agentState.issue
                ? String($agentState.issue.number)
                : undefined,
            cta: { label: "+ Issue", onclick: openCreate },
            loading: issuesLoading,
            empty: "Aucune issue ouverte",
        },
        {
            id: "tasks",
            label: "Tasks",
        },
    ] satisfies TabDef[];
</script>

<JgrTabList
    {tabs}
    activeTab={$projetPanelTab}
    ontabchange={(id) => projetPanelTab.set(id)}
    onselect={(tabId, item) => {
        if (tabId === "issues") {
            const issue = issues.find((i) => String(i.number) === item.id);
            if (issue) selectIssue(issue);
        }
    }}
>
    {#snippet customcontent(currentTabId)}
        {#if currentTabId === "tasks"}
            <TaskList />
        {/if}
    {/snippet}
</JgrTabList>
