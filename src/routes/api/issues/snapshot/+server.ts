import fs from "fs";
import { json } from "@sveltejs/kit";

const SNAPSHOT_FILE = ".agent/analysis-snapshot.json";
const ANALYSIS_FILE = ".agent/analysis.md";

export type IssueSnapshot = { number: number; title: string; updatedAt: string };

export async function GET() {
    try {
        if (!fs.existsSync(SNAPSHOT_FILE)) {
            return json({ snapshot: null, hasResult: false });
        }
        const snapshot: IssueSnapshot[] = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf-8"));
        const hasResult = fs.existsSync(ANALYSIS_FILE);
        return json({ snapshot, hasResult });
    } catch {
        return json({ snapshot: null, hasResult: false });
    }
}
