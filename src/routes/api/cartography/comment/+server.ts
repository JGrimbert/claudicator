import { json } from "@sveltejs/kit";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
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

const BATCH_SIZE = 10; // méthodes par appel Claude

// ─── Lecture de l'index ────────────────────────────────────────────────────────

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

// ─── Génération des descriptions via claude -p ─────────────────────────────────

/** Extrait le code source d'une plage de lignes */
function extractCode(fileLines: string[], startLine: number, endLine: number): string {
    const start = Math.max(0, startLine - 1);
    const end   = Math.min(fileLines.length, Math.max(endLine, startLine + 1));
    return fileLines.slice(start, end).join("\n").trim().slice(0, 500);
}

/** Génère des descriptions via Claude pour un lot de méthodes */
function generateDescriptions(
    methods: Array<{ signature: string; code: string }>
): string[] {
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
    /** Génère des descriptions de méthodes via Claude CLI */
    ].join("\n");

    const { ANTHROPIC_API_KEY: _k, CLAUDECODE: _cc, ...cleanEnv } = process.env as Record<string, string | undefined>;

    try {
        const output = execFileSync("claude", ["-p", "--dangerously-skip-permissions"], {
            input:    prompt,
            encoding: "utf-8",
            env:      cleanEnv as NodeJS.ProcessEnv,
            shell:    true,
            timeout:  90_000,
        });

        const descs = new Array<string>(methods.length).fill("");
        for (const line of output.trim().split("\n")) {
            const m = line.match(/^(\d+)[.\)]\s*(.+)/);
            if (m) {
                const idx = parseInt(m[1]) - 1;
                if (idx >= 0 && idx < methods.length) descs[idx] = m[2].trim();
            }
        }
        return descs;
    } catch {
        /** Insère des commentaires JSDoc dans le fichier source */
        return new Array<string>(methods.length).fill("");
    }
}

// ─── Insertion JSDoc dans le fichier source ────────────────────────────────────

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

        // La ligne précédente a-t-elle déjà un commentaire ?
        const prev = (fileLines[idx - 1] ?? "").trimEnd();
        if (/^\s*(\/\*|\*|\/\/|@)/.test(prev)) continue;

        const indent = (fileLines[idx].match(/^(\s*)/) ?? ["", ""])[1];
        fileLines.splice(idx, 0, `${indent}/** ${description} */`);
        count++;
    }

    if (count > 0) writeFileSync(filePath, fileLines.join("\n"), "utf-8");
    return count;
}

// ─── GET — statistiques ────────────────────────────────────────────────────────

/** Retourne les stats de documentation de l'index */
export function GET() {
    const projectRoot = getProjectRoot();
    const byFile      = getUndescribedByFile(projectRoot);
    const methods     = readIndex(projectRoot);
    const total       = Object.keys(methods).length;
    const undescribed = [...byFile.values()].reduce((n, arr) => n + arr.length, 0);

    return json({ total, undescribed });
}

// ─── POST — agent de commentaire ──────────────────────────────────────────────

/** Lance la génération de descriptions sur les méthodes manquantes */
export async function POST({ request }: { request: Request }) {
    const body  = await request.json().catch(() => ({}));
    const limit = Math.min(body.limit ?? 500, 1000);

    const projectRoot = getProjectRoot();
    const byFile      = getUndescribedByFile(projectRoot);

    if (byFile.size === 0) {
        return json({ message: "Toutes les méthodes sont déjà documentées" });
    }

    // Construire la liste des fichiers à traiter en respectant la limite
    let remaining = limit;
    const filesToProcess: Array<{ file: string; methods: IndexMethod[] }> = [];
    for (const [file, methods] of byFile) {
        if (remaining <= 0) break;
        const slice = methods.slice(0, remaining);
        filesToProcess.push({ file, methods: slice });
        remaining -= slice.length;
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            const emit = (line: string, type = "system") => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line, type })}\n\n`));
                } catch { /* stream fermé */ }
            };

            (async () => {
                let totalAdded = 0;

                for (const { file, methods } of filesToProcess) {
                    const fullPath = join(projectRoot, file);
                    if (!existsSync(fullPath)) { emit(`⊘ ${file} introuvable`); continue; }

                    emit(`${file} (${methods.length})…`);

                    const fileLines = readFileSync(fullPath, "utf-8").split("\n");

                    // Découper en batches, appeler claude -p par batch
                    const allDescriptions: Array<{ line: number; description: string }> = [];

                    for (let i = 0; i < methods.length; i += BATCH_SIZE) {
                        const batch = methods.slice(i, i + BATCH_SIZE);
                        const items = batch.map(m => ({
                            signature: m.signature,
                            code:      extractCode(fileLines, m.line, m.endLine),
                        }));
                        const descs = generateDescriptions(items);
                        for (let j = 0; j < batch.length; j++) {
                            if (descs[j]) allDescriptions.push({ line: batch[j].line, description: descs[j] });
                        }
                    }

                    const added = insertJsDoc(fullPath, allDescriptions);
                    totalAdded += added;
                    emit(added > 0
                        ? `✓ ${file} — ${added} commentaire${added > 1 ? "s" : ""}`
                        : `⊘ ${file} — déjà commenté`
                    );
                }

                // Refresh index pour que lolve-cartography lise les nouveaux commentaires
                try {
                    emit("Rafraîchissement de l'index…");
                    refreshIndex(projectRoot);
                    emit(`✓ Terminé — ${totalAdded} commentaire${totalAdded > 1 ? "s" : ""} ajouté${totalAdded > 1 ? "s" : ""}`);
                } catch (e: any) {
                    emit(`⚠ Refresh index : ${e.message}`);
                }

                try { controller.close(); } catch { /* déjà fermé */ }
            })().catch(err => {
                try {
                    emit(`Erreur fatale : ${err.message}`);
                    controller.close();
                } catch { /* déjà fermé */ }
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
