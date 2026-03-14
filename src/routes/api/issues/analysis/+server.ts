/** Issues — déclenche l'analyse d'issues via Claude (POST) */
import fs from "fs";

const ANALYSIS_FILE = ".agent/analysis.md";

/** Lit et retourne un fichier roadmap ou analyse */
export async function GET({ url }: { url: URL }) {
    const id = url.searchParams.get("id");
    const filePath = id ? `.agent/roadmaps/${id}.md` : ANALYSIS_FILE;
    try {
        if (!fs.existsSync(filePath)) return new Response("", { status: 404 });
        const content = fs.readFileSync(filePath, "utf-8");
        return new Response(content, {
            headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
    } catch {
        return new Response("", { status: 500 });
    }
}
