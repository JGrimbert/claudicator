import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import { listFullPlans } from "$lib/server/services/fullPlans";
import { listTasks } from "$lib/server/services/tasks";

/**
 * GET /api/issues/groups/full-plans/active
 * Retourne le premier fullPlan associé à une task en status "implementation",
 * pour restaurer l'UI au démarrage.
 */
export const GET: RequestHandler = async () => {
    const tasks = listTasks();
    const activeTask = tasks.find(t => t.type === "fullplan" && t.status === "implementation" && t.fullPlanId);
    if (!activeTask?.fullPlanId) return json(null);

    const plans = listFullPlans();
    const plan = plans.find(p => p.id === activeTask.fullPlanId);
    if (!plan || plan.status !== "done") return json(null);

    return json({ id: plan.id, keyword: plan.keyword, status: plan.status, planFile: plan.planFile, taskId: activeTask.id });
};
