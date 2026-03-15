/** POST — SSE : collecte progressive des co-modifications git */
import { getProjectRoot } from "$lib/server/services/projects";
import {
    ensureHistoryDir,
    getHistoryState,
    saveHistoryState,
    isCommitProcessed,
    saveCommitRecord,
    loadAllCommitRecords,
    findSymbolsForFiles,
    buildHistoricalCoal,
    parseIssueRefs,
} from "$lib/server/services/git-history";
import { getCommitLog, getCommitFiles, getHeadCommit } from "$lib/server/services/git";

export async function POST() {
    ensureHistoryDir();
    const root = getProjectRoot();

    const stream = new ReadableStream({
        async start(controller) {
            const enc = new TextEncoder();
            const send = (data: object) =>
                controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));

            try {
                const commits = await getCommitLog(root, 200);
                const headSha = commits[0]?.sha ?? "";
                const total   = commits.length;
                let processed = 0;
                let skipped   = 0;

                for (const commit of commits) {
                    if (isCommitProcessed(commit.sha)) {
                        processed++;
                        skipped++;
                        continue;
                    }
                    const files     = await getCommitFiles(root, commit.sha);
                    const symbols   = findSymbolsForFiles(files, root);
                    const issueRefs = parseIssueRefs(commit.message);
                    saveCommitRecord({ sha: commit.sha, symbols, issueRefs });
                    processed++;
                    send({ type: "progress", processed, total, sha: commit.sha.slice(0, 7) });
                }

                // Reconstruire la coalescence historique
                const records = loadAllCommitRecords();
                const coal    = buildHistoricalCoal(records);

                const prev = getHistoryState();
                saveHistoryState({
                    ...prev,
                    lastProcessedSha: headSha,
                    headSha,
                    processedCount: processed,
                    coal,
                    updatedAt: new Date().toISOString(),
                });

                send({ type: "done", processedCount: processed, skipped, coalCount: coal.length });
            } catch (err: any) {
                send({ type: "error", message: String(err?.message ?? err) });
            }

            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type":  "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive",
        },
    });
}
