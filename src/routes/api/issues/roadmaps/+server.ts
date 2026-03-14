import fs from "fs";
import path from "path";

export async function GET() {
    try {
        const dir = ".agent/roadmaps";
        if (!fs.existsSync(dir)) {
            return new Response("[]", { headers: { "Content-Type": "application/json" } });
        }
        const files = fs.readdirSync(dir).filter(f => f.endsWith(".md"));
        const roadmaps = files.map(f => {
            const id = f.replace(/\.md$/, "");
            const name = id.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const stat = fs.statSync(path.join(dir, f));
            return { id, name, updatedAt: stat.mtime.toISOString() };
        }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

        return new Response(JSON.stringify(roadmaps), {
            headers: { "Content-Type": "application/json" }
        });
    } catch {
        return new Response("[]", { headers: { "Content-Type": "application/json" } });
    }
}
