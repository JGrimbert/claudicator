/** Cartographie — génère l'arbre visuel par régions sémantiques (GET) */
import { json } from "@sveltejs/kit";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { getProjectRoot } from "$lib/server/services/projects";
import { classifyFile, type SemanticRegion } from "$lib/server/agent/segments";

interface MethodInfo {
    sig: string;
    role: string | null;
    described: boolean;
    description: string | null;
    isPrivate: boolean;
}

export interface TreeNode {
    name: string;         // clé unique (chemin complet pour les arbres de dossiers)
    label?: string;       // nom affiché (différent de name pour les nœuds de dossier)
    extendsClass: string | null;
    depth: number;
    prefix: string;           // "│   ├── " etc.
    isLast: boolean;
    file: string | null;
    role: string | null;
    description: string | null;
    methods: MethodInfo[];
}

export interface DiagramSection {
    region: string;
    label: string;
    icon: string;
    tree: TreeNode[];
}

const REGION_LABELS: Record<SemanticRegion, string> = {
    ui:     'UI / Composants',
    domain: 'Logique Métier',
    api:    'API / Routes',
    infra:  'Infrastructure',
    store:  'Stores',
    tests:  'Tests',
    config: 'Config',
};

const REGION_ICONS: Record<SemanticRegion, string> = {
    ui:     '◈',
    domain: '◆',
    api:    '◇',
    infra:  '▣',
    store:  '▤',
    tests:  '▦',
    config: '▧',
};

const REGION_ORDER: SemanticRegion[] = ['domain', 'infra', 'api', 'ui', 'store', 'tests', 'config'];

/** Scanne récursivement les fichiers JS/TS d'un dossier */
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

function makeFileNode(filePath: string, group: { methods: MethodInfo[]; role: string | null; description: string | null }): TreeNode {
    const name = basename(filePath).replace(/\.(ts|js|svelte|vue)$/, "");
    return { name, extendsClass: null, depth: 0, prefix: "", isLast: false, file: filePath, role: group.role, description: group.description, methods: group.methods };
}

type FileGroup = { methods: MethodInfo[]; role: string | null; description: string | null; region: SemanticRegion };

/** Construit une arborescence de dossiers à partir d'une map filePath → group */
function buildFolderTree(fileMap: Map<string, FileGroup>): TreeNode[] {
    type Dir = { name: string; children: Map<string, Dir>; filePath?: string; group?: FileGroup };
    const root: Dir = { name: "", children: new Map() };

    const paths = [...fileMap.keys()];
    if (paths.length === 0) return [];

    // Trouve le préfixe de dossier commun à tous les fichiers
    const splitDirs = paths.map(p => p.split("/").slice(0, -1));
    let commonLen = splitDirs[0].length;
    for (const parts of splitDirs) {
        let common = 0;
        for (let i = 0; i < Math.min(commonLen, parts.length); i++) {
            if (splitDirs[0][i] === parts[i]) common++;
            else break;
        }
        commonLen = Math.min(commonLen, common);
    }

    // Insère chaque fichier dans l'arbre
    for (const filePath of paths) {
        const parts = filePath.split("/").slice(commonLen); // chemin relatif
        let node = root;
        for (const part of parts) {
            if (!node.children.has(part)) node.children.set(part, { name: part, children: new Map() });
            node = node.children.get(part)!;
        }
        node.filePath = filePath;
        node.group = fileMap.get(filePath);
    }

    // Tri : dossiers avant fichiers, puis alphabétique
    function sortChildren(children: Map<string, Dir>): [string, Dir][] {
        return [...children.entries()].sort(([, a], [, b]) => {
            const aDir = !a.filePath;
            const bDir = !b.filePath;
            if (aDir !== bDir) return aDir ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }

    // DFS → tableau plat de TreeNodes avec préfixes ASCII
    const result: TreeNode[] = [];
    function visit(dir: Dir, depth: number, isLast: boolean, ancIsLasts: boolean[], pathKey: string) {
        let prefix = "";
        for (const a of ancIsLasts) prefix += a ? "    " : "│   ";
        if (depth > 0) prefix += isLast ? "└── " : "├── ";

        const label    = dir.filePath ? dir.name.replace(/\.(ts|js|svelte|vue)$/, "") : dir.name;
        const uniqueKey = pathKey ? `${pathKey}/${label}` : label;
        const group    = dir.group;

        result.push({
            name:        uniqueKey,
            label,
            extendsClass: null,
            depth,
            prefix,
            isLast,
            file:        dir.filePath ?? null,
            role:        group?.role ?? null,
            description: group?.description ?? null,
            methods:     group?.methods ?? [],
        });

        const children = sortChildren(dir.children);
        for (let i = 0; i < children.length; i++) {
            visit(children[i][1], depth + 1, i === children.length - 1, [...ancIsLasts, isLast], uniqueKey);
        }
    }

    const rootChildren = sortChildren(root.children);
    for (let i = 0; i < rootChildren.length; i++) {
        visit(rootChildren[i][1], 0, i === rootChildren.length - 1, [], "");
    }
    return result;
}

export async function GET() {
    const PROJECT_PATH = getProjectRoot();
    const indexPath = join(PROJECT_PATH, ".cache/method-index.json");
    const annotPath = join(PROJECT_PATH, ".cache/annotation-cache.json");
    const primaPath = join(PROJECT_PATH, "src/prima");

    if (!existsSync(indexPath)) {
        return json({ error: "Index introuvable — lance annotate index" }, { status: 404 });
    }
    const isPrima = existsSync(primaPath);

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

        const entries = Object.entries(allMethods) as [string, any][];
        const total     = entries.length;
        const described = entries.filter(([, m]) => m.description).length;

        // ── 2. Group methods by file, classify by region ──────────────────────
        const byFile = new Map<string, FileGroup>();

        for (const [key, m] of entries) {
            const filePath = (m.file ?? "unknown").replace(/\\/g, "/");
            const srcIdx   = filePath.indexOf("src/");
            const relPath  = srcIdx >= 0 ? filePath.slice(srcIdx) : filePath;
            const region   = classifyFile(relPath);

            if (!byFile.has(filePath)) byFile.set(filePath, { methods: [], role: null, description: null, region });
            const group = byFile.get(filePath)!;

            // Pour les fichiers prima, ignorer l'entrée factory (clé sans point)
            if (!isPrima || key.includes(".")) {
                group.methods.push({
                    sig:         m.signature ?? m.name ?? key,
                    role:        m.role ?? null,
                    described:   !!(m.description),
                    description: m.description ?? null,
                    isPrivate:   m.isPrivate ?? false,
                });
            }
            if (!group.role && m.role)               group.role        = m.role;
            if (!group.description && m.description) group.description = m.description;
        }

        // ── 3. Build section map ──────────────────────────────────────────────
        const sectionMap = new Map<SemanticRegion, TreeNode[]>();
        for (const r of REGION_ORDER) sectionMap.set(r, []);

        if (isPrima) {
            // ── Section domain : hiérarchie d'héritage prima ─────────────────
            const primaFiles = scanJs(primaPath);
            const classMap   = new Map<string, { extends: string | null; file: string }>();
            for (const { rel, full } of primaFiles) {
                try {
                    const content = readFileSync(full, "utf-8");
                    const name    = capitalize(basename(rel, ".js"));
                    classMap.set(name, { extends: extractExtends(content), file: "src/prima/" + rel.replace(/\\/g, "/") });
                } catch {}
            }

            const byClass = new Map<string, MethodInfo[]>();
            const primaEntries = entries.filter(([, m]) => m.file?.replace(/\\/g, "/").includes("src/prima"));
            for (const [key, m] of primaEntries) {
                const dot = key.indexOf(".");
                const cls = dot > 0 ? key.slice(0, dot) : key;
                if (!byClass.has(cls)) byClass.set(cls, []);
                if (dot > 0) {
                    byClass.get(cls)!.push({
                        sig:         m.signature ?? m.name ?? key,
                        role:        m.role ?? null,
                        described:   !!(m.description),
                        description: m.description ?? null,
                        isPrivate:   m.isPrivate ?? false,
                    });
                }
            }

            const childrenOf = new Map<string | null, string[]>();
            for (const [name, info] of classMap) {
                const parent = info.extends && classMap.has(info.extends) ? info.extends : null;
                if (!childrenOf.has(parent)) childrenOf.set(parent, []);
                childrenOf.get(parent)!.push(name);
            }

            const domainTree: TreeNode[] = [];
            function visit(name: string, depth: number, isLast: boolean, ancIsLasts: boolean[]) {
                const info = classMap.get(name);
                if (!info) return;
                let prefix = "";
                for (const a of ancIsLasts) prefix += a ? "    " : "│   ";
                if (depth > 0) prefix += isLast ? "└── " : "├── ";
                const methods     = byClass.get(name) ?? [];
                const ext         = info.extends && classMap.has(info.extends) ? info.extends : null;
                const rawEntry    = allMethods[name];
                const role        = methods.find(m => m.role && m.role !== "internal")?.role ?? rawEntry?.role ?? null;
                const description = rawEntry?.description ?? methods.find(m => m.description)?.description ?? null;
                domainTree.push({ name, extendsClass: ext, depth, prefix, isLast, file: info.file, role, description, methods });
                const kids = (childrenOf.get(name) ?? []).sort();
                for (let i = 0; i < kids.length; i++) visit(kids[i], depth + 1, i === kids.length - 1, [...ancIsLasts, isLast]);
            }
            const roots = (childrenOf.get(null) ?? []).sort();
            for (let i = 0; i < roots.length; i++) visit(roots[i], 0, i === roots.length - 1, []);
            sectionMap.set('domain', domainTree);

            // ── Autres régions : fichiers hors prima ─────────────────────────
            const apiFilesPrima = new Map([...byFile.entries()].filter(([p, g]) => !p.includes("src/prima") && g.region === 'api'));
            sectionMap.set('api', buildFolderTree(apiFilesPrima));

            for (const [filePath, group] of byFile) {
                if (filePath.includes("src/prima")) continue;
                if (group.region === 'api') continue; // déjà traité
                sectionMap.get(group.region)?.push(makeFileNode(filePath, group));
            }
        } else {
            // ── Mode générique : api en arbre, autres régions à plat ──────────
            const apiFilesGeneric = new Map([...byFile.entries()].filter(([, g]) => g.region === 'api'));
            sectionMap.set('api', buildFolderTree(apiFilesGeneric));

            for (const [filePath, group] of byFile) {
                if (group.region === 'api') continue; // déjà traité
                sectionMap.get(group.region)?.push(makeFileNode(filePath, group));
            }
        }

        // Tri + isLast pour les sections à nœuds plats (pas api qui gère ça en interne)
        for (const [region, nodes] of sectionMap) {
            if (region === 'api') continue; // déjà trié par buildFolderTree
            if (region !== "domain") nodes.sort((a, b) => (a.label ?? a.name).localeCompare(b.label ?? b.name));
            const roots = nodes.filter(n => n.depth === 0);
            for (let i = 0; i < roots.length; i++) roots[i].isLast = i === roots.length - 1;
        }

        // ── 4. Assemblage final (sections non-vides) ──────────────────────────
        const sections: DiagramSection[] = REGION_ORDER
            .filter(r => (sectionMap.get(r) ?? []).length > 0)
            .map(r => ({ region: r, label: REGION_LABELS[r], icon: REGION_ICONS[r], tree: sectionMap.get(r)! }));

        return json({ summary: { total, described }, sections });
    } catch (e: any) {
        return json({ error: e.message }, { status: 500 });
    }
}
