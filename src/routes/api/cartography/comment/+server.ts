import { json } from "@sveltejs/kit";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { spawn } from "child_process";
import { getProjectRoot } from "$lib/server/services/projects";
import { refreshIndex } from "$lib/server/services/cartography";

/** Méthodes non décrites, groupées par fichier. */
type IndexMethod = {
    key:       string;
    file:      string;
    signature: string;
    line:      number;
    endLine:   number;
};

const BATCH_SIZE = 50; // méthodes par appel Claude

/** Lit l'index des méthodes depuis le cache */
function readIndex(projectRoot: string): Record<string, any> {
    const p = join(projectRoot, ".cache/method-index.json");
    if (!existsSync(p)) return {};
    try { return JSON.parse(readFileSync(p, "utf-8")).methods ?? {}; } catch { return {}; }
}

/** Regroupe les méthodes non documentées par fichier */
function getUndescribedByFile(projectRoot: string): Map<string, IndexMethod[]> {
    const methods = readIndex(projectRoot);
    const byFile = new Map<string, IndexMethod[]>();

    for (const [key, m] of Object.entries(methods) as [string, any][]) {
        if (m.description || m.isPrivate || !m.file || !m.line) continue;
        const file = (m.file as string).split("\\").join("/");
        if (!byFile.has(file)) byFile.set(file, []);
        byFile.get(file)!.push({
            key,
            file,
            signature: m.signature ?? key,
            line:    m.line,
            endLine: m.endLine ?? m.line + 5,
        });
    }

    for (const arr of byFile.values()) arr.sort((a, b) => a.line - b.line);
    return byFile;
}

/**
 * Construit le graphe d'imports entre les fichiers du projet.
 * graph[A] = [B, C] signifie que A importe B et C.
 */
function buildFileGraph(files: string[], projectRoot: string): Map<string, string[]> {
    const fileSet = new Set(files);
    const graph   = new Map<string, string[]>(files.map(f => [f, []]));

    for (const file of files) {
        const fullPath = join(projectRoot, file);
        if (!existsSync(fullPath)) continue;

        let content: string;
        try { content = readFileSync(fullPath, "utf-8"); } catch { continue; }

        const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
        const dir = dirname(file);
        let match;

        while ((match = importRegex.exec(content)) !== null) {
            const resolved = join(dir, match[1]).split("\\").join("/");
            for (const candidate of [resolved, `${resolved}.ts`, `${resolved}.vue`, `${resolved}.js`, `${resolved}.svelte`]) {
                if (fileSet.has(candidate)) {
                    graph.get(file)!.push(candidate);
                    break;
                }
            }
        }
    }

    return graph;
}

/**
 * Tri topologique par DFS post-order.
 * Les feuilles (fichiers sans imports internes) arrivent en premier —
 * ce sont les utilitaires de bas niveau, plus simples à annoter.
 */
function topoSort(files: string[], graph: Map<string, string[]>): string[] {
    const visited  = new Set<string>();
    const visiting = new Set<string>(); // détection de cycles
    const order: string[] = [];

    function dfs(file: string) {
        if (visited.has(file) || visiting.has(file)) return;
        visiting.add(file);
        for (const dep of (graph.get(file) ?? [])) dfs(dep);
        visiting.delete(file);
        visited.add(file);
        order.push(file);
    }

    for (const file of files) dfs(file);
    return order;
}

/** Calcule la profondeur de chaque fichier dans le graphe (0 = feuille pure) */
function computeDepths(files: string[], graph: Map<string, string[]>): Map<string, number> {
    const depths = new Map<string, number>();
    const fileSet = new Set(files);

    for (const file of files) {
        const internalDeps = (graph.get(file) ?? []).filter(d => fileSet.has(d));
        if (internalDeps.length === 0) depths.set(file, 0);
    }

    let changed = true;
    while (changed) {
        changed = false;
        for (const file of files) {
            if (depths.has(file)) continue;
            const deps = (graph.get(file) ?? []).filter(d => fileSet.has(d));
            if (deps.every(d => depths.has(d))) {
                depths.set(file, Math.max(...deps.map(d => depths.get(d)! + 1)));
                changed = true;
            }
        }
    }
    // Fichiers dans des cycles → profondeur -1
    for (const file of files) { if (!depths.has(file)) depths.set(file, -1); }

    return depths;
}

/** Extrait le code source d'une plage de lignes */
function extractCode(fileLines: string[], startLine: number, endLine: number): string {
    const start = Math.max(0, startLine - 1);
    const end   = Math.min(fileLines.length, Math.max(endLine, startLine + 1));
    return fileLines.slice(start, end).join("\n").trim().slice(0, 500);
}

/** Génère des descriptions via Claude pour un lot de méthodes (async — ne bloque pas l'event loop) */
async function generateDescriptions(
    methods: Array<{ signature: string; code: string }>
): Promise<string[]> {
    const prompt = [
        "Génère une description courte (5-10 mots max) pour chacune des méthodes ci-dessous.",
        "Réponds UNIQUEMENT avec une liste numérotée, une description par ligne.",
        "Format exact : 1. description, 2. description, etc.",
        "",
        ...methods.map((m, i) => [
            `[${i + 1}] ${m.signature}`,
            "```",
            m.code,
            "```",
            "",
        ].join("\n")),
    ].join("\n");

    const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;

    const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";

    return new Promise((resolve, reject) => {
        const child = spawn(claudeCmd, ["-p", "--dangerously-skip-permissions"], {
            env:         cleanEnv as NodeJS.ProcessEnv,
            shell:       true,
            windowsHide: true,
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

        child.stdin.write(prompt, "utf-8");
        child.stdin.end();

        const timer = setTimeout(() => {
            child.kill();
            reject(new Error(`timeout 300s — stderr: ${stderr.slice(0, 200)}`));
        }, 300_000);

        child.on("error", (err) => { clearTimeout(timer); reject(err); });

        child.on("close", (code) => {
            clearTimeout(timer);
            const out = stdout.trim();

            if (!out) {
                reject(new Error(`claude exit ${code} — stderr: ${stderr.trim().slice(0, 300)}`));
                return;
            }

            const descs = new Array<string>(methods.length).fill("");
            for (const line of out.split("\n")) {
                const m = line.match(/^(\d+)[.\)]\s*(.+)/);
                if (m) {
                    const idx = parseInt(m[1]) - 1;
                    if (idx >= 0 && idx < methods.length) descs[idx] = m[2].trim();
                }
            }

            if (descs.filter(Boolean).length === 0) {
                reject(new Error(`aucune description parsée — sortie: ${out.slice(0, 300)}`));
                return;
            }

            resolve(descs);
        });
    });
}

/** Insère des JSDoc dans un fichier source */
function insertJsDoc(
    filePath: string,
    entries: Array<{ line: number; description: string }>
): number {
    if (!existsSync(filePath)) return 0;
    const fileLines = readFileSync(filePath, "utf-8").split("\n");
    let count = 0;

    // Insérer de bas en haut pour que les numéros de ligne restent valides
    const sorted = entries
        .filter(e => e.description)
        .sort((a, b) => b.line - a.line);

    for (const { line, description } of sorted) {
        const idx = line - 1; // 0-indexed : ligne cible de la déclaration
        if (idx <= 0 || idx >= fileLines.length) continue;

        let checkIdx = idx - 1;
        while (checkIdx >= 0 && (fileLines[checkIdx] ?? "").trim() === "") checkIdx--;
        const prev = (fileLines[checkIdx] ?? "").trimEnd();
        if (/^\s*\/\*[\s\S]|^\s*\*[\s/]/.test(prev)) continue;

        const indent = (fileLines[idx].match(/^(\s*)/) ?? ["", ""])[1];
        fileLines.splice(idx, 0, `${indent}/** ${description} */`);
        count++;
    }

    if (count > 0) writeFileSync(filePath, fileLines.join("\n"), "utf-8");
    return count;
}

/** Retourne les stats de documentation de l'index */
export function GET() {
    const projectRoot = getProjectRoot();
    const byFile      = getUndescribedByFile(projectRoot);
    const methods     = readIndex(projectRoot);
    const total       = Object.keys(methods).length;
    const undescribed = [...byFile.values()].reduce((n, arr) => n + arr.length, 0);

    return json({ total, undescribed });
}

/** Lance la génération de descriptions sur les méthodes manquantes */
export async function POST({ request }: { request: Request }) {
    const body  = await request.json().catch(() => ({}));
    const limit = Math.min(body.limit ?? 500, 1000);

    const projectRoot = getProjectRoot();
    const byFile      = getUndescribedByFile(projectRoot);
    const encoder     = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            const emit = (line: string, type = "system") => {
                try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line, type })}\n\n`)); } catch { /* fermé */ }
            };

            (async () => {
                // ── Diagnostic ──────────────────────────────────────────────
                const totalUndescribed = [...byFile.values()].reduce((n, a) => n + a.length, 0);
                emit(`index: ${byFile.size} fichiers, ${totalUndescribed} méthodes sans description`);

                if (byFile.size === 0) {
                    emit("⊘ Index : toutes les méthodes sont déjà documentées");
                    controller.close(); return;
                }

                // Construire fileMap
                let remaining = limit;
                const fileMap = new Map<string, IndexMethod[]>();
                for (const [file, methods] of byFile) {
                    if (remaining <= 0) break;
                    fileMap.set(file, methods.slice(0, remaining));
                    remaining -= Math.min(methods.length, remaining);
                }

                // Pré-filtrer : déjà commentée dans la source
                for (const file of [...fileMap.keys()]) {
                    const fullPath = join(projectRoot, file);
                    if (!existsSync(fullPath)) { fileMap.delete(file); continue; }
                    const lines = readFileSync(fullPath, "utf-8").split("\n");
                    const before = fileMap.get(file)!.length;

                    const filtered = fileMap.get(file)!.filter(m => {
                        const idx = m.line - 1;
                        if (idx <= 0) return true;
                        let checkIdx = idx - 1;
                        while (checkIdx >= 0 && (lines[checkIdx] ?? "").trim() === "") checkIdx--;
                        const prev = (lines[checkIdx] ?? "").trimEnd();
                        return !/^\s*\/\*[\s\S]|^\s*\*[\s/]/.test(prev);
                    });

                    emit(`  ${file}: ${before} → ${filtered.length} après filtre commentaires`);
                    if (filtered.length === 0) fileMap.delete(file);
                    else fileMap.set(file, filtered);
                }

                if (fileMap.size === 0) {
                    emit("⊘ Tout est déjà commenté dans la source");
                    controller.close(); return;
                }

                // Trier par ordre topologique
                const allFiles    = [...fileMap.keys()];
                const graph       = buildFileGraph(allFiles, projectRoot);
                const depths      = computeDepths(allFiles, graph);
                const sorted      = topoSort(allFiles, graph);
                const toProcess   = sorted.map(f => ({ file: f, methods: fileMap.get(f)! }));

                let totalAdded = 0;

                for (const { file, methods } of toProcess) {
                    const fullPath = join(projectRoot, file);
                    if (!existsSync(fullPath)) { emit(`⊘ ${file} introuvable`); continue; }

                    const depth = depths.get(file) ?? -1;
                    const depthLabel = depth === 0 ? "feuille" : depth === -1 ? "cycle" : `niveau ${depth}`;
                    emit(`[${depthLabel}] ${file} (${methods.length})…`);

                    const fileLines = readFileSync(fullPath, "utf-8").split("\n");
                    const allDescriptions: Array<{ line: number; description: string }> = [];

                    for (let i = 0; i < methods.length; i += BATCH_SIZE) {
                        const batch = methods.slice(i, i + BATCH_SIZE);
                        const items = batch.map(m => ({
                            signature: m.signature,
                            code:      extractCode(fileLines, m.line, m.endLine),
                        }));
                        emit(`  batch ${i / BATCH_SIZE + 1} (${batch.length} méthodes)…`);
                        try {
                            const descs = await generateDescriptions(items);
                            for (let j = 0; j < batch.length; j++) {
                                if (descs[j]) allDescriptions.push({ line: batch[j].line, description: descs[j] });
                            }
                        } catch (e: any) {
                            emit(`⚠ batch échoué : ${e.message}`);
                        }
                    }

                    const added = insertJsDoc(fullPath, allDescriptions);
                    totalAdded += added;
                    emit(added > 0
                        ? `✓ ${file} — ${added} commentaire${added > 1 ? "s" : ""}`
                        : `⊘ ${file} — déjà commenté`
                    );
                }

                try {
                    emit("Rafraîchissement de l'index…");
                    refreshIndex(projectRoot);
                    emit(`✓ Terminé — ${totalAdded} commentaire${totalAdded > 1 ? "s" : ""} ajouté${totalAdded > 1 ? "s" : ""}`);
                } catch (e: any) {
                    emit(`⚠ Refresh index : ${e.message}`);
                }

                try { controller.close(); } catch { /* déjà fermé */ }
            })().catch(err => {
                try { emit(`Erreur fatale : ${err.message}`); controller.close(); } catch { /* déjà fermé */ }
            });
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type":  "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive",
        }
    });
}
