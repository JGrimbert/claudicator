/** GET — état de l'historique git (état courant + slots par issue + isUpToDate) */
import { json } from "@sveltejs/kit";
import { getHistoryState, ensureHistoryDir, getIssueSlots } from "$lib/server/services/git-history";
import { getProjectRoot }                                    from "$lib/server/services/projects";
import { getHeadCommit }                                     from "$lib/server/services/git";

export async function GET() {
    ensureHistoryDir();
    const root  = getProjectRoot();
    const state = getHistoryState();

    let headSha = "";
    try { headSha = await getHeadCommit(root); } catch { /* projet cible non accessible */ }

    const isUpToDate = !!headSha && headSha === state.lastProcessedSha;
    const slots      = getIssueSlots();

    return json({ state, headSha, isUpToDate, slots });
}
