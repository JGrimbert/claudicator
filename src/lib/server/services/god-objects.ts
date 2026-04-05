/** God Objects — détection des fichiers trop volumineux */
import fs from "fs";
import path from "path";

export type GodObjectEntry = {
    path: string;        // chemin relatif depuis la racine du projet
    lines: number;
    severity: "warning" | "critical";
};

export type GodObjectScan = {
    scannedAt: string;
    projectRoot: string;
    thresholds: { warning: number; critical: number };
    files: GodObjectEntry[];
};

const SCAN_FILE = ".agent/god-objects.json";
const EXTENSIONS = new Set([".svelte", ".ts", ".js"]);
const IGNORE_DIRS = new Set([
    "node_modules", ".agent", "dist", ".svelte-kit", "build", "patches", ".git",
]);
const DEFAULT_THRESHOLDS = { warning: 400, critical: 700 };

function countLines(filePath: string): number {
    return fs.readFileSync(filePath, "utf-8").split("\n").length;
}

function walk(dir: string, projectRoot: string, out: { full: string; rel: string }[]) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, projectRoot, out);
        } else if (EXTENSIONS.has(path.extname(entry.name))) {
            out.push({ full, rel: path.relative(projectRoot, full).replace(/\\/g, "/") });
        }
    }
}

export function scanGodObjects(
    projectRoot: string,
    thresholds = DEFAULT_THRESHOLDS
): GodObjectScan {
    const found: { full: string; rel: string }[] = [];
    walk(projectRoot, projectRoot, found);

    const files: GodObjectEntry[] = found
        .map(({ full, rel }) => ({ rel, lines: countLines(full) }))
        .filter(({ lines }) => lines >= thresholds.warning)
        .map(({ rel, lines }) => ({
            path: rel,
            lines,
            severity: (lines >= thresholds.critical ? "critical" : "warning") as GodObjectEntry["severity"],
        }))
        .sort((a, b) => b.lines - a.lines);

    const scan: GodObjectScan = {
        scannedAt: new Date().toISOString(),
        projectRoot,
        thresholds,
        files,
    };

    fs.mkdirSync(path.dirname(SCAN_FILE), { recursive: true });
    fs.writeFileSync(SCAN_FILE, JSON.stringify(scan, null, 2));

    return scan;
}

export function loadGodObjects(): GodObjectScan | null {
    if (!fs.existsSync(SCAN_FILE)) return null;
    return JSON.parse(fs.readFileSync(SCAN_FILE, "utf-8"));
}
