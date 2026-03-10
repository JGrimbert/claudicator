import { json } from "@sveltejs/kit";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { getProjectRoot } from "$lib/server/services/projects";

interface MethodInfo {
    sig: string;
    role: string | null;
    described: boolean;
    description: string | null;
    isPrivate: boolean;
}

export interface TreeNode {
    name: string;
    extendsClass: string | null;
    depth: number;
    prefix: string;           // "│   ├── " etc.
    isLast: boolean;
    file: string | null;
    role: string | null;
    description: string | null;
    methods: MethodInfo[];
}

function scanJs(dir: string, rel = ""): Array<{ rel: string; full: string }> {
    const result: Array<{ rel: string; full: string }> = [];
    try {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) {
                result.push(...scanJs(full, rel + entry + "/"));
            } else if (entry.endsWith(".js") || entry.endsWith(".ts")) {
                result.push({ rel: rel + entry, full });
            }
        }
    } catch {}
    return result;
}

function extractExtends(content: string): string | null {
    return content.match(/class\s+\w+\s+extends\s+(?:\$\.)?(\w+)/)?.[1] ?? null;
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

export async function GET() {
    const PROJECT_PATH = getProjectRoot();
    const indexPath = join(PROJECT_PATH, ".cache/method-index.json");
    const annotPath = join(PROJECT_PATH, ".cache/annotation-cache.json");
    const primaPath = join(PROJECT_PATH, "src/prima");

    if (!existsSync(indexPath) || !existsSync(primaPath)) {
        return json({ error: "Index ou src/prima introuvable" }, { status: 404 });
    }

    try {
        // ── 1. Load + merge method-index + annotation-cache ──────────────────
        const raw = JSON.parse(readFileSync(indexPath, "utf-8"));
        const allMethods: Record<string, any> = raw.methods ?? {};

        let annots: Record<string, any> = {};
        if (existsSync(annotPath)) {
            try { annots = JSON.parse(readFileSync(annotPath, "utf-8")).annotations ?? {}; } catch {}
        }
        for (const [key, m] of Object.entries(allMethods)) {
            const a = annots[key];
            if (a) { m.role ??= a.role; m.description ??= a.description; }
        }

        // ── 2. Filter to prima only ───────────────────────────────────────────
        const primaEntries = Object.entries(allMethods).filter(([, m]) =>
            m.file?.replace(/\\/g, "/").includes("src/prima")
        ) as [string, any][];

        const total     = primaEntries.length;
        const described = primaEntries.filter(([, m]) => m.description).length;

        // ── 3. Scan prima files → inheritance map ─────────────────────────────
        const primaFiles = scanJs(primaPath);
        const classMap   = new Map<string, { extends: string | null; file: string }>();

        for (const { rel, full } of primaFiles) {
            try {
                const content = readFileSync(full, "utf-8");
                const name    = capitalize(basename(rel, ".js"));
                classMap.set(name, {
                    extends: extractExtends(content),
                    file:    "src/prima/" + rel.replace(/\\/g, "/"),
                });
            } catch {}
        }

        // ── 4. Group methods by class ─────────────────────────────────────────
        const byClass = new Map<string, MethodInfo[]>();
        for (const [key, m] of primaEntries) {
            const dot = key.indexOf(".");
            const cls = dot > 0 ? key.slice(0, dot) : key;
            if (!byClass.has(cls)) byClass.set(cls, []);
            if (dot > 0) {   // skip the factory-fn entry itself, keep only named methods
                byClass.get(cls)!.push({
                    sig:         m.signature ?? m.name ?? key,
                    role:        m.role ?? null,
                    described:   !!(m.description),
                    description: m.description ?? null,
                    isPrivate:   m.isPrivate ?? false,
                });
            }
        }

        // ── 5. Build tree (DFS, flat output with prefix strings) ──────────────
        const childrenOf = new Map<string | null, string[]>();
        for (const [name, info] of classMap) {
            const parent = info.extends && classMap.has(info.extends) ? info.extends : null;
            if (!childrenOf.has(parent)) childrenOf.set(parent, []);
            childrenOf.get(parent)!.push(name);
        }

        const tree: TreeNode[] = [];

        function visit(name: string, depth: number, isLast: boolean, ancIsLasts: boolean[]) {
            const info = classMap.get(name);
            if (!info) return;

            // Compute the tree-drawing prefix
            let prefix = "";
            for (const a of ancIsLasts) prefix += a ? "    " : "│   ";
            if (depth > 0) prefix += isLast ? "└── " : "├── ";

            const methods  = byClass.get(name) ?? [];
            const ext      = info.extends && classMap.has(info.extends) ? info.extends : null;
            const rawEntry = allMethods[name];   // the factory-fn entry itself (if any)

            // Role: prefer a non-internal named-method role, then class entry role
            const role =
                methods.find(m => m.role && m.role !== "internal")?.role ??
                rawEntry?.role ??
                null;
            const description = rawEntry?.description ?? methods.find(m => m.description)?.description ?? null;

            tree.push({ name, extendsClass: ext, depth, prefix, isLast, file: info.file, role, description, methods });

            const kids = (childrenOf.get(name) ?? []).sort();
            for (let i = 0; i < kids.length; i++) {
                visit(kids[i], depth + 1, i === kids.length - 1, [...ancIsLasts, isLast]);
            }
        }

        const roots = (childrenOf.get(null) ?? []).sort();
        for (let i = 0; i < roots.length; i++) {
            visit(roots[i], 0, i === roots.length - 1, []);
        }

        return json({ summary: { total, described }, tree });
    } catch (e: any) {
        return json({ error: e.message }, { status: 500 });
    }
}
