import { json } from "@sveltejs/kit";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getProjectRoot } from "$lib/server/services/projects";
import { refreshIndex } from "$lib/server/services/cartography";
import { spawnClaudeStream } from "$lib/server/agent/claude-stream";

type MethodEntry = {
    file: string;
    signature: string;
    startLine: number;
    description: string | null;
    isPrivate?: boolean;
};

/** Lit l'index et retourne les méthodes sans description. */
function getUndescribedMethods(projectRoot: string): MethodEntry[] {
    const indexPath = join(projectRoot, ".cache/method-index.json");
    if (!existsSync(indexPath)) return [];
    try {
        const index = JSON.parse(readFileSync(indexPath, "utf-8"));
        const methods = index.methods ?? {};
        return Object.entries(methods)
            .filter(([, m]: [string, any]) => !m.description && !m.isPrivate)
            .map(([, m]: [string, any]): MethodEntry => ({
                file:      (m.file ?? "").split("\\").join("/"),
                signature: m.signature ?? "",
                startLine: m.startLine ?? m.line ?? 0,
                description: null,
            }))
            .filter(m => m.file && m.signature && m.startLine > 0)
            .sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine);
    } catch {
        return [];
    }
}

/** Construit le prompt pour Claude. */
function buildCommentPrompt(
    groups: Array<{ file: string; methods: Array<{ signature: string; startLine: number }> }>
): string {
    const lines: string[] = [];
    lines.push("TASK");
    lines.push("Ajouter des commentaires JSDoc aux méthodes non documentées");
    lines.push("");
    lines.push("OBJECTIF");
    lines.push("Les méthodes listées ci-dessous n'ont pas de commentaire dans le code source.");
    lines.push("Pour chaque méthode, ajoute /** description concise */ sur une seule ligne juste avant la déclaration.");
    lines.push("");
    lines.push("CONTRAINTES");
    lines.push("- Format strict : /** description en 5-10 mots max */ sur une SEULE ligne avant la déclaration");
    lines.push("- Ne modifie PAS la signature, le corps, ni toute autre ligne du fichier");
    lines.push("- Un seul Edit par fichier : lis le fichier entier, puis édite une seule fois avec tous les commentaires");
    lines.push("- Si une méthode a déjà un commentaire (/** */ ou //, ou une ligne vide suivie d'un commentaire), ignore-la");
    lines.push("- Les chemins de fichiers sont relatifs à la racine du projet (ton cwd)");
    lines.push("");
    lines.push("MÉTHODES À COMMENTER");

    for (const group of groups) {
        lines.push("");
        lines.push(`### ${group.file}`);
        for (const m of group.methods) {
            lines.push(`- ligne ${m.startLine} : ${m.signature}`);
        }
    }

    return lines.join("\n");
}

/** GET — statistiques sur les méthodes non documentées. */
export function GET() {
    const projectRoot = getProjectRoot();
    const undescribed = getUndescribedMethods(projectRoot);

    const indexPath = join(projectRoot, ".cache/method-index.json");
    let total = 0;
    if (existsSync(indexPath)) {
        try {
            const idx = JSON.parse(readFileSync(indexPath, "utf-8"));
            total = Object.keys(idx.methods ?? {}).length;
        } catch { /* ignore */ }
    }

    return json({
        total,
        undescribed: undescribed.length,
        methods: undescribed.slice(0, 200).map(m => ({
            file: m.file, signature: m.signature, startLine: m.startLine
        })),
    });
}

/** POST — lance l'agent Claude pour commenter les méthodes sans description. */
export async function POST({ request }: { request: Request }) {
    const body = await request.json().catch(() => ({}));
    const limit: number = Math.min(body.limit ?? 30, 100);

    const projectRoot = getProjectRoot();
    const undescribed = getUndescribedMethods(projectRoot).slice(0, limit);

    if (undescribed.length === 0) {
        return json({ message: "Toutes les méthodes sont déjà documentées" });
    }

    // Grouper par fichier
    const byFile = new Map<string, Array<{ signature: string; startLine: number }>>();
    for (const m of undescribed) {
        if (!byFile.has(m.file)) byFile.set(m.file, []);
        byFile.get(m.file)!.push({ signature: m.signature, startLine: m.startLine });
    }
    const groups = [...byFile.entries()].map(([file, methods]) => ({ file, methods }));

    const prompt = buildCommentPrompt(groups);

    const stream = spawnClaudeStream(
        prompt,
        { path: projectRoot },
        (lines) => {
            if (lines.length > 0) {
                // Rafraîchir l'index pour prendre en compte les nouveaux commentaires
                try { refreshIndex(projectRoot); } catch { /* silencieux */ }
            }
        },
        { addDir: projectRoot }
    );

    return new Response(stream, {
        headers: {
            "Content-Type":  "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive",
        }
    });
}
