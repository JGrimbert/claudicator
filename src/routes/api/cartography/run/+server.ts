import { spawn } from "child_process";
import { join } from "path";
import dotenv from "dotenv";

dotenv.config();

const ALLOWED_CMDS: Record<string, string[]> = {
    "full":        ["annotate", "full"],
    "full:force":  ["annotate", "full", "--force"],
    "index":       ["annotate", "index"],
    "enrich":      ["annotate", "enrich"],
    "scan":        ["annotate", "scan"],
    "stats":       ["annotate", "stats"],
};

export async function POST({ request }) {
    const { cmd } = await request.json();
    const args = ALLOWED_CMDS[cmd];

    if (!args) {
        return new Response(`data: ${JSON.stringify({ line: `Commande inconnue: ${cmd}` })}\n\n`, {
            status: 400,
            headers: { "Content-Type": "text/event-stream" }
        });
    }

    const projectPath = process.env.TARGET_PROJECT_PATH ?? "C:/lolve";
    const cartoPath   = process.env.CARTOGRAPHY_PATH    ?? "C:/lolve-cartography";
    const cli         = join(cartoPath, "bin/cli.cjs");
    const encoder     = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            const emit = (line: string) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line })}\n\n`));
                } catch { /* stream fermé */ }
            };

            const proc = spawn("node", [cli, "--project", projectPath, ...args]);

            proc.stdout.on("data", chunk =>
                chunk.toString().split("\n").filter(Boolean).forEach(emit)
            );
            proc.stderr.on("data", chunk =>
                chunk.toString().split("\n").filter(Boolean).forEach(emit)
            );
            proc.on("close", code => {
                emit(`[exit ${code === 0 ? "✓ terminé" : `erreur ${code}`}]`);
                try { controller.close(); } catch { /* déjà fermé */ }
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
