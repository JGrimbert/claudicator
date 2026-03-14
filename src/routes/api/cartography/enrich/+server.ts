/** Cartographie — enrichit les descriptions de méthodes via Claude (POST) */
import { spawn } from "child_process";
import { join } from "path";
import { getProjectRoot } from "$lib/server/services/projects";

/** Lance la cartographie du projet en SSE */
export async function POST() {
    const projectPath = getProjectRoot();
    const cartoPath   = process.env.CARTOGRAPHY_PATH     ?? "C:/lolve-cartography";
    const cli         = join(cartoPath, "bin/cli.cjs");

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            const emit = (line: string) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line })}\n\n`));
            };

            // Étape 1 : index, puis étape 2 : enrich
            const runStep = (args: string[], onDone: () => void) => {
                const proc = spawn("node", [cli, "--project", projectPath, ...args]);

                proc.stdout.on("data", (chunk) => {
                    chunk.toString().split("\n").filter(Boolean).forEach(emit);
                });
                proc.stderr.on("data", (chunk) => {
                    chunk.toString().split("\n").filter(Boolean).forEach(emit);
                });
                proc.on("close", (code) => {
                    emit(`[exit ${code}]`);
                    onDone();
                });
            };

            emit("Démarrage de annotate index...");
            runStep(["annotate", "index"], () => {
                emit("Démarrage de annotate enrich...");
                runStep(["annotate", "enrich"], () => {
                    emit("✓ Enrichissement terminé");
                    try { controller.close(); } catch { /* déjà fermé */ }
                });
            });
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type":  "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive"
        }
    });
}
