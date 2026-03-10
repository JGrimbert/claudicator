import fs from "fs";

const ANALYSIS_FILE = ".agent/analysis.md";

export async function GET() {
    try {
        if (!fs.existsSync(ANALYSIS_FILE)) {
            return new Response("", { status: 404 });
        }
        const content = fs.readFileSync(ANALYSIS_FILE, "utf-8");
        return new Response(content, {
            headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
    } catch {
        return new Response("", { status: 500 });
    }
}
