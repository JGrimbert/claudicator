/** CSS Analysis — construit le prompt d'audit CSS pour Claude */
import fs from "fs";
import path from "path";

const IGNORE_DIRS = new Set([
    "node_modules", ".agent", "dist", ".svelte-kit", "build", "patches", ".git",
]);

export type CssFileData = {
    path: string;
    totalLines: number;
    styleLines: number;
    styleRatio: number;
    styleBlock: string;
    definedClasses: string[];
    usedClasses: string[];
};

function walk(dir: string, root: string, out: { full: string; rel: string }[]) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, root, out);
        else if (entry.name.endsWith(".svelte"))
            out.push({ full, rel: path.relative(root, full).replace(/\\/g, "/") });
    }
}

function extractStyle(content: string): string {
    return content.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? "";
}

function extractTemplate(content: string): string {
    return content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/g, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
}

function definedClasses(style: string): string[] {
    const s = new Set<string>();
    const re = /\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(style)) !== null) s.add(m[1]);
    return [...s];
}

function usedClasses(template: string): string[] {
    const s = new Set<string>();
    let m: RegExpExecArray | null;
    const reStatic = /class="([^"]+)"/g;
    while ((m = reStatic.exec(template)) !== null)
        m[1].split(/\s+/).filter(Boolean).forEach(c => s.add(c));
    const reDir = /class:([a-zA-Z0-9_-]+)/g;
    while ((m = reDir.exec(template)) !== null) s.add(m[1]);
    const reDyn = /class=\{[^}]*['"`]([a-zA-Z0-9_ -]+)['"`]/g;
    while ((m = reDyn.exec(template)) !== null)
        m[1].split(/\s+/).filter(Boolean).forEach(c => s.add(c));
    return [...s];
}

export function collectCssFiles(projectRoot: string): CssFileData[] {
    const found: { full: string; rel: string }[] = [];
    walk(projectRoot, projectRoot, found);

    return found
        .map(({ full, rel }) => {
            const content = fs.readFileSync(full, "utf-8");
            const totalLines = content.split("\n").length;
            const styleBlock = extractStyle(content);
            const styleLines = styleBlock ? styleBlock.split("\n").length : 0;
            const template = extractTemplate(content);
            return {
                path: rel,
                totalLines,
                styleLines,
                styleRatio: totalLines > 0 ? styleLines / totalLines : 0,
                styleBlock,
                definedClasses: definedClasses(styleBlock),
                usedClasses: usedClasses(template),
            };
        })
        .filter(f => f.styleLines > 10)
        .sort((a, b) => b.styleLines - a.styleLines);
}

export function buildCssPrompt(files: CssFileData[]): string {
    const totalStyle = files.reduce((s, f) => s + f.styleLines, 0);
    const totalLines = files.reduce((s, f) => s + f.totalLines, 0);
    const lines: string[] = [];

    lines.push("TASK");
    lines.push("Audit CSS d'un projet Svelte 5");
    lines.push("");
    lines.push("OBJECTIF");
    lines.push("Analyser les composants Svelte listés ci-dessous et produire un plan d'audit CSS actionnable.");
    lines.push("Contexte : projet Svelte 5 (runes mode), bibliothèque de composants partagés appelée jgr-ui.");
    lines.push("Composants jgr-ui déjà disponibles : JgrLayout, JgrTabs, JgrTabList, JgrCta, JgrBtn, JgrItem,");
    lines.push("JgrConsole, JgrDag, JgrRoadmap, JgrPre, JgrPrompt, JgrTheme.");
    lines.push("");
    lines.push("AXES D'ANALYSE");
    lines.push("1. Classes CSS potentiellement mortes : définies dans <style> mais absentes du template");
    lines.push("   ⚠ Les bindings dynamiques peuvent provoquer des faux positifs — rester conservateur");
    lines.push("2. Patterns CSS répétés entre plusieurs composants");
    lines.push("   (ex : scrollbar webkit, flexbox layout, border 1px solid var(--border), monospace typography)");
    lines.push("3. Classes business-specific → abstraction : classes contenant des termes métier");
    lines.push("   (task, plan, issue, agent, step, branch, commit, atlas, cluster, region, skill, cand, eval, dbg, impl...)");
    lines.push("   → proposer un nom agnostique équivalent");
    lines.push("4. Candidats jgr-ui : patterns assez génériques pour devenir un composant partagé");
    lines.push("   Critère d'entrée : aucun terme métier, props génériques, utilisable dans d'autres projets Svelte 5");
    lines.push("");
    lines.push("FORMAT DE SORTIE OBLIGATOIRE");
    lines.push("## Résumé");
    lines.push("<bilan : volume CSS, principaux problèmes, priorités>");
    lines.push("");
    lines.push("## Fichiers prioritaires");
    lines.push("### chemin/fichier.svelte");
    lines.push("- **Mortes candidates :** .foo, .bar (à valider)");
    lines.push("- **Patterns répétés :** description (N fichiers concernés)");
    lines.push("- **Abstractions :** .task-row → .list-row");
    lines.push("- **Candidat jgr-ui :** NomComposant — props : prop1, prop2");
    lines.push("");
    lines.push("## Patterns globaux à unifier");
    lines.push("- Pattern : liste des fichiers concernés");
    lines.push("");
    lines.push("## Candidats jgr-ui (par ordre de priorité)");
    lines.push("1. JgrXxx — ce qu'il fait — remplace : .classe-a, .classe-b dans N fichiers");
    lines.push("");
    lines.push(`CONTEXTE`);
    lines.push(`${files.length} composants — ${totalLines} lignes totales — ${totalStyle} lignes CSS (${Math.round(totalStyle / totalLines * 100)}% du code)`);
    lines.push("");

    // Top 5 : CSS complet
    const TOP_FULL = 5;
    lines.push("COMPOSANTS — CSS COMPLET (les plus volumineux, analyse approfondie)");
    lines.push("");
    for (const f of files.slice(0, TOP_FULL)) {
        lines.push(`### ${f.path} — ${f.styleLines} lignes CSS (${Math.round(f.styleRatio * 100)}%)`);
        lines.push(`Définies : ${f.definedClasses.join(", ") || "—"}`);
        lines.push(`Utilisées : ${f.usedClasses.join(", ") || "—"}`);
        lines.push("```css");
        lines.push(f.styleBlock.trim());
        lines.push("```");
        lines.push("");
    }

    // Reste : stats + classes seulement
    lines.push("COMPOSANTS — STATISTIQUES (analyse des patterns et abstractions)");
    for (const f of files.slice(TOP_FULL)) {
        const dead = f.definedClasses.filter(c => !f.usedClasses.includes(c));
        lines.push(`- **${f.path}** — ${f.styleLines}l CSS (${Math.round(f.styleRatio * 100)}%)`);
        lines.push(`  Définies(${f.definedClasses.length}) : ${f.definedClasses.slice(0, 12).join(", ")}${f.definedClasses.length > 12 ? "…" : ""}`);
        if (dead.length > 0)
            lines.push(`  ⚠ Mortes candidates(${dead.length}) : ${dead.slice(0, 8).join(", ")}${dead.length > 8 ? "…" : ""}`);
    }

    return lines.join("\n");
}
