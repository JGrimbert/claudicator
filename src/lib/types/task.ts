/**
 * Types canoniques pour les tasks Claudicator.
 * Source de vérité unique — importée par les composants et les services.
 */

export type TaskStatus =
    | "specification"
    | "planification"
    | "implementation"
    | "documentation"
    | "validation"
    | "merged"
    | "failed";

export type TaskType = "standard" | "fullplan";
export type Filter = "specification" | "implementation" | "validation" | "merged";
export type WfPanel = "plan" | "implement" | "commit" | "push" | "patch";

export type TokenUsage = { inputTokens: number; outputTokens: number };

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
    usage?: TokenUsage;
    totalUsage?: TokenUsage;
    planUsage?: TokenUsage;
    implUsage?: TokenUsage;
    hasPlan?: boolean;
    hasPatch?: boolean;
    atlasEnabled?: boolean;
    createdAt: string;
    updatedAt: string;
};

export type PatchInfo = {
    name: string;
    issueNumber?: number;
    issueNumbers?: number[];
    hasTests: boolean;
    createdAt: number;
    stale?: boolean;
    isPureUI?: boolean;
    durationMs?: number;
};

export type IssueRef = { number: number; title: string };
export type IssueState = "patch-tests" | "patch-no-tests" | "no-patch";
export type IssueRow = IssueRef & { stack: string; state: IssueState; patch?: PatchInfo };

export type FullPlanDetail = {
    id: string;
    keyword?: string;
    status?: string;
    planFile?: string;
    subStacks: { keyword: string; issues: IssueRef[] }[];
    residualIssues?: IssueRef[];
    stepFiles?: { filename: string; issues: number[] }[];
};

export type SandboxState = { applied: string[]; deps: Record<string, string[]> };
export type CommitAllProgress = {
    done: number;
    total: number;
    current: string;
    branch?: string;
    error?: string;
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
    specification:  "Spécification",
    planification:  "Planification",
    implementation: "Implémentation",
    documentation:  "Validation",
    validation:     "Validation",
    merged:         "Mergée",
    failed:         "Échouée",
};

export const STATUS_COLOR: Record<TaskStatus, string> = {
    specification:  "555555",
    planification:  "f7c948",
    implementation: "2196f3",
    documentation:  "9c27b0",
    validation:     "9c27b0",
    merged:         "4caf50",
    failed:         "f44336",
};

export const FILTERS = ["specification", "implementation", "validation", "merged"] as const;
