/**
 * Helpers extraits de TaskList.svelte pour être testables.
 * Ce module ne doit contenir que de la logique pure (sans DOM ni stores Svelte).
 */

export type TaskStatus = "specification" | "planification" | "implementation" | "documentation" | "validation" | "merged" | "failed";
export type TaskType = "standard" | "fullplan";
export type Filter = "specification" | "implementation" | "validation" | "merged";

export type Task = {
    id: string;
    title: string;
    status: TaskStatus;
    type?: TaskType;
    fullPlanId?: string;
    issueNumber?: number;
    branch?: string;
    pushed?: boolean;
    logs: string[];
    hasPlan?: boolean;
    hasPatch?: boolean;
    atlasEnabled?: boolean;
    createdAt: string;
    updatedAt: string;
};

// issue #36 - type PlanGroup (correspond au type du store agent)
export type PlanGroup = {
    index: number;
    name: string;
    issues: number[];
    summary: string;
    dependsOn: string[];
};

export function taskToFilter(task: Task): Filter | null {
    if (task.status === "planification" && task.hasPlan) return "implementation";
    if (task.status === "specification" || task.status === "planification") return "specification";
    if (task.status === "implementation") return "implementation";
    if (task.status === "documentation" || task.status === "validation") return "validation";
    if (task.status === "merged") return "merged";
    return null;
}

export function btnVariant(idx: number, currentStep: number): "active" | "secondary" | "disabled" {
    if (idx === currentStep) return "active";
    if (idx < currentStep) return "secondary";
    return "disabled";
}

// issue #41 - payload pour l'input central
export function buildCentralInputPayload(
    text: string,
    taskId: string
): { input: string; taskId: string } | null {
    const trimmed = text.trim();
    if (!trimmed || !taskId) return null;
    return { input: trimmed, taskId };
}

// issue #178 - sélecteur CSS pour cibler un task-row par son id
export function isTaskRowSelector(taskId: string): string {
    return `[data-task-id="${taskId}"]`;
}

// issue #185 - résumé d'un diff (nombre de fichiers modifiés)
export type DiffSummary = {
    fileCount: number;
    files: string[];
};

export function formatDiffSummary(diff: string): DiffSummary {
    if (!diff.trim()) return { fileCount: 0, files: [] };
    // Les lignes "diff --git a/<file> b/<file>" marquent le début de chaque fichier
    const matches = [...diff.matchAll(/^diff --git a\/.+ b\/(.+)$/gm)];
    const files = matches.map(m => m[1]);
    return { fileCount: files.length, files };
}

// issue #36 - groupement des tasks par plan groups
export type TaskGroup = {
    name: string;
    tasks: Task[];
};

export function groupTasksByPlan(tasks: Task[], planGroups: PlanGroup[]): TaskGroup[] {
    if (!planGroups.length) {
        return [{ name: "Sans groupe", tasks }];
    }

    const result: TaskGroup[] = [];
    const assignedIds = new Set<string>();

    for (const group of planGroups) {
        const groupTasks = tasks.filter(t =>
            t.issueNumber !== undefined && group.issues.includes(t.issueNumber)
        );
        for (const t of groupTasks) assignedIds.add(t.id);
        result.push({ name: group.name, tasks: groupTasks });
    }

    const ungrouped = tasks.filter(t => !assignedIds.has(t.id));
    if (ungrouped.length > 0) {
        result.push({ name: "Sans groupe", tasks: ungrouped });
    }

    return result;
}

// issue #132 - détection de fin de run sur la task sélectionnée
export type FinishedDetectInput = {
    wasRunning: boolean;
    isRunning: boolean;
    runningTaskId: string | null;
    selectedTaskId: string | null;
};

export function detectJustFinished(input: FinishedDetectInput): boolean {
    return (
        input.wasRunning &&
        !input.isRunning &&
        input.runningTaskId === input.selectedTaskId &&
        input.selectedTaskId !== null
    );
}

// issue #18 - payload pour marquer une task comme implémentée
export function buildMarkImplementedPayload(task: Task): { status: "documentation" } | null {
    if (task.status !== "implementation") return null;
    return { status: "documentation" };
}

// issue #154 - onglet console initial selon l'état de la task
// Si la task n'a pas encore de plan → afficher le panneau "plan"
// Si la task a déjà un plan → afficher "symbols" pour naviguer dans le code
export function getInitialConsoleTab(task: Task): "plan" | "symbols" {
    if (task.hasPlan) return "symbols";
    return "plan";
}

// issue #246 - trouver le DAG d'une task dans le dictionnaire de DAGs par keyword
// Un DAG correspond à une task si son step contient l'issueNumber de la task
export type RoadmapStep = {
    id: number;
    label: string;
    issues?: number[];
    [key: string]: unknown;
};

export type RoadmapDataMinimal = {
    steps: RoadmapStep[];
    spine: unknown[];
    stats: unknown;
};

export function findTaskDag(
    task: Task,
    dagsByKeyword: Record<string, RoadmapDataMinimal>
): RoadmapDataMinimal | null {
    if (!task.issueNumber) return null;
    for (const dag of Object.values(dagsByKeyword)) {
        const found = dag.steps.some(step =>
            step.issues?.includes(task.issueNumber!) || step.id === task.issueNumber
        );
        if (found) return dag;
    }
    return null;
}

// issue #40 - filtrage des issues pour la recherche cross-type
// Utilise une recherche simple par substring dans le titre
export type IssueSearchItem = {
    number: number;
    title: string;
    keyword?: string;
};

export function filterIssuesForSearch(
    issues: IssueSearchItem[],
    query: string
): IssueSearchItem[] {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const lower = trimmed.toLowerCase();
    return issues.filter(i =>
        i.title.toLowerCase().includes(lower) ||
        String(i.number).includes(lower) ||
        (i.keyword ?? "").toLowerCase().includes(lower)
    );
}
