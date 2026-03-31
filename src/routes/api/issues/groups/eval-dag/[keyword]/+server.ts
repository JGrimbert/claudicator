import type { RequestHandler } from "./$types";
import fs from "fs";
import path from "path";
import { getFullPlan } from "$lib/server/services/fullPlans";

export const GET: RequestHandler = async ({ params, url }) => {
    const { keyword } = params;
    const planId = url.searchParams.get("planId");

    const evalPath = path.join(process.cwd(), ".agent", "eval-dags", `${keyword}.json`);
    if (!fs.existsSync(evalPath)) {
        return new Response(JSON.stringify({ exists: false, levels: [] }), {
            headers: { "Content-Type": "application/json" },
        });
    }

    let evalDag: { deps: { from: number; to: number[] }[] };
    try {
        evalDag = JSON.parse(fs.readFileSync(evalPath, "utf-8"));
    } catch {
        return new Response(JSON.stringify({ exists: false, levels: [] }), {
            headers: { "Content-Type": "application/json" },
        });
    }

    // Build issue→stack map from fullPlan
    const issueToStack = new Map<number, string>();
    const allNums = new Set<number>();
    if (planId) {
        const fullPlan = getFullPlan(planId);
        if (fullPlan?.subStacks) {
            for (const s of fullPlan.subStacks) {
                for (const issue of s.issues) {
                    issueToStack.set(issue.number, s.keyword);
                    allNums.add(issue.number);
                }
            }
        }
    }

    // Also include issues from deps
    for (const { from, to } of (evalDag.deps ?? [])) {
        allNums.add(from);
        for (const t of to) allNums.add(t);
    }

    if (allNums.size === 0) {
        return new Response(JSON.stringify({ exists: true, levels: [] }), {
            headers: { "Content-Type": "application/json" },
        });
    }

    // Topological levels
    const precedes = new Map<number, Set<number>>();
    const successors = new Map<number, number[]>();
    for (const n of allNums) { precedes.set(n, new Set()); successors.set(n, []); }
    for (const { from, to } of (evalDag.deps ?? [])) {
        for (const t of to) {
            if (allNums.has(t) && allNums.has(from)) {
                precedes.get(t)?.add(from);
                successors.get(from)?.push(t);
            }
        }
    }
    const level = new Map<number, number>();
    const queue: number[] = [];
    for (const [n, preds] of precedes) {
        if (preds.size === 0) { level.set(n, 0); queue.push(n); }
    }
    let qi = 0;
    while (qi < queue.length) {
        const n = queue[qi++];
        for (const s of (successors.get(n) ?? [])) {
            const lv = (level.get(n) ?? 0) + 1;
            if (!level.has(s) || level.get(s)! < lv) { level.set(s, lv); queue.push(s); }
        }
    }
    for (const n of allNums) { if (!level.has(n)) level.set(n, 0); }

    // Group by level
    const byLevel = new Map<number, number[]>();
    for (const [n, lv] of level) {
        if (!byLevel.has(lv)) byLevel.set(lv, []);
        byLevel.get(lv)!.push(n);
    }

    if (byLevel.size === 0) {
        return new Response(JSON.stringify({ exists: true, levels: [] }), {
            headers: { "Content-Type": "application/json" },
        });
    }

    const maxLevel = Math.max(...byLevel.keys());
    const levels: { level: number; issues: number[]; stacks: string[] }[] = [];
    for (let lv = 0; lv <= maxLevel; lv++) {
        const issues = (byLevel.get(lv) ?? []).sort((a, b) => a - b);
        const stacks = [...new Set(
            issues.map(n => issueToStack.get(n)).filter((s): s is string => !!s)
        )];
        levels.push({ level: lv, issues, stacks });
    }

    return new Response(JSON.stringify({ exists: true, levels }), {
        headers: { "Content-Type": "application/json" },
    });
};
