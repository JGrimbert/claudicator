/** Plans complets de groupes — persistance JSON dans .agent/full-plans/ */
import fs from "fs";
import path from "path";

export type FullPlanStatus = "generating" | "done" | "error";

export type FullPlan = {
    id: string;
    keyword: string;
    status: FullPlanStatus;
    planFile?: string;
    subStacks: { keyword: string; issues: { number: number; title: string }[] }[];
    residualIssues?: { number: number; title: string }[];
    stepAtlasFiles?: Record<string, string>;
    stepFiles?: { filename: string; issues: number[] }[];
    createdAt: number;
    updatedAt: number;
};

const FULL_PLANS_DIR = ".agent/full-plans";

function ensureDir() {
    fs.mkdirSync(FULL_PLANS_DIR, { recursive: true });
}

function planPath(id: string) {
    return path.join(FULL_PLANS_DIR, `${id}.json`);
}

export function createFullPlan(data: Omit<FullPlan, "createdAt" | "updatedAt">): FullPlan {
    ensureDir();
    const plan: FullPlan = {
        ...data,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    fs.writeFileSync(planPath(plan.id), JSON.stringify(plan, null, 2));
    return plan;
}

export function getFullPlanDir(planId: string): string {
    return path.join(FULL_PLANS_DIR, planId);
}

export function updateFullPlan(id: string, patch: Partial<Pick<FullPlan, "status" | "planFile" | "stepAtlasFiles" | "stepFiles" | "updatedAt">>): void {
    const p = planPath(id);
    if (!fs.existsSync(p)) return;
    const plan: FullPlan = JSON.parse(fs.readFileSync(p, "utf-8"));
    const updated = { ...plan, ...patch, updatedAt: Date.now() };
    fs.writeFileSync(p, JSON.stringify(updated, null, 2));
}

export function getFullPlan(id: string): FullPlan | null {
    const p = planPath(id);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function listFullPlans(): FullPlan[] {
    ensureDir();
    return fs.readdirSync(FULL_PLANS_DIR)
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(FULL_PLANS_DIR, f), "utf-8")) as FullPlan)
        .sort((a, b) => b.createdAt - a.createdAt);
}

export function getLatestFullPlan(): FullPlan | null {
    const plans = listFullPlans();
    return plans.length > 0 ? plans[0] : null;
}
