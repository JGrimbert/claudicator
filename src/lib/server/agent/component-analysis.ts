/** Component Analysis — construit le prompt d'audit d'architecture de composants */
import fs from "fs";
import path from "path";

const IGNORE_DIRS = new Set([
    "node_modules", ".agent", "dist", ".svelte-kit", "build", "patches", ".git",
]);

export type ComponentMeta = {
    path: string;
    lines: number;
    jgrUiImports: string[];
    localImports: string[];
    templateComponents: string[];    // <ComponentName tags dans le template
    hasStreaming: boolean;            // SSE / fetch stream
    hasEach: number;                  // nb de {#each}
    scriptContent: string;           // script sans <style> (pour les top N)
    templateSummary: string;         // résumé template (éléments top-level)
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

function extractScript(content: string): string {
    return content.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? "";
}

function stripStyle(content: string): string {
    return content.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
}

function extractTemplate(content: string): string {
    return content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/g, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
}

function jgrImports(script: string): string[] {
    const m = script.match(/import\s+\{([^}]+)\}\s+from\s+['"]jgr-ui['"]/);
    if (!m) return [];
    return m[1].split(",").map(s => s.trim()).filter(Boolean);
}

function localImportsList(script: string): string[] {
    const re = /import\s+\w+\s+from\s+['"]\.\//g;
    const names: string[] = [];
    let m: RegExpExecArray | null;
    const nameRe = /import\s+(\w+)\s+from/;
    const fullRe = /import\s+\w+\s+from\s+['"][^'"]+['"]/g;
    let fm: RegExpExecArray | null;
    while ((fm = fullRe.exec(script)) !== null) {
        if (!fm[0].includes("jgr-ui") && (fm[0].includes("./") || fm[0].includes("$lib"))) {
            const nm = fm[0].match(/import\s+(\w+)\s+from/);
            if (nm) names.push(nm[1]);
        }
    }
    return [...new Set(names)];
}

function templateComponents(template: string): string[] {
    const re = /<([A-Z][a-zA-Z0-9]+)/g;
    const found = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(template)) !== null) found.add(m[1]);
    return [...found];
}

function templateSummary(template: string): string {
    // Extraire les éléments racines (class ou tag de premier niveau)
    const topClasses = [...template.matchAll(/class="([^"]+)"/g)]
        .slice(0, 6)
        .map(m => m[1].split(" ")[0]);
    const tags = [...template.matchAll(/<(div|section|header|footer|main|aside|nav|button|form)\b/g)]
        .slice(0, 4)
        .map(m => m[1]);
    const snippets = (template.match(/\{#snippet\s+(\w+)/g) ?? []).map(s => s.replace("{#snippet ", ""));
    return [
        topClasses.length ? `classes: ${topClasses.join(", ")}` : "",
        tags.length ? `tags: ${[...new Set(tags)].join(", ")}` : "",
        snippets.length ? `snippets: ${snippets.join(", ")}` : "",
    ].filter(Boolean).join(" | ");
}

export function collectComponents(projectRoot: string): ComponentMeta[] {
    const found: { full: string; rel: string }[] = [];
    walk(projectRoot, projectRoot, found);

    return found.map(({ full, rel }) => {
        const content = fs.readFileSync(full, "utf-8");
        const lines = content.split("\n").length;
        const script = extractScript(content);
        const template = extractTemplate(content);
        return {
            path: rel,
            lines,
            jgrUiImports: jgrImports(script),
            localImports: localImportsList(script),
            templateComponents: templateComponents(template),
            hasStreaming: /readAnalysisStream|EventSource|getReader|stream-json/.test(script),
            hasEach: (template.match(/\{#each/g) ?? []).length,
            scriptContent: script,
            templateSummary: templateSummary(template),
        };
    }).sort((a, b) => b.lines - a.lines);
}

export function buildComponentPrompt(components: ComponentMeta[]): string {
    const lines: string[] = [];

    lines.push("TASK");
    lines.push("Audit architecture composants Svelte — séparation métier/abstrait + candidats jgr-ui");
    lines.push("");
    lines.push("CONTEXTE DU PROJET");
    lines.push("Claudicator est un outil d'orchestration de développement (Git, GitHub, Claude Code).");
    lines.push("Il utilise Svelte 5 (runes mode) et une bibliothèque de composants partagés : jgr-ui.");
    lines.push("");
    lines.push("jgr-ui existants : JgrLayout, JgrTabs, JgrTabList, JgrCta, JgrBtn, JgrItem,");
    lines.push("JgrConsole, JgrDag, JgrRoadmap, JgrPre, JgrPrompt, JgrTheme.");
    lines.push("");
    lines.push(`${components.length} composants dans src/lib/components/ — structure PLATE (pas de hiérarchie de dossiers sauf plan/).`);
    lines.push("");
    lines.push("OBJECTIFS DE L'ANALYSE");
    lines.push("1. **Hiérarchie de dossiers** : proposer une organisation en sous-dossiers par couche UI");
    lines.push("   (pas par domaine métier — par type de responsabilité visuelle)");
    lines.push("2. **Séparation métier/abstrait** : identifier les composants ou portions de composants");
    lines.push("   qui sont domain-agnostic et pourraient être extraits");
    lines.push("3. **Patterns récurrents** : trouver les structures UI qui se répètent (shell, pattern, layout)");
    lines.push("   et proposer un composant jgr-ui pour chacun");
    lines.push("4. **Candidats jgr-ui concrets** : propositions avec nom, props interface, fichiers sources");
    lines.push("");
    lines.push("PATTERNS DÉJÀ IDENTIFIÉS (à approfondir)");
    lines.push("- Groupe A : panel header + scroll + footer (GlobalPlanView, FullPlanView, TaskPlanPanel)");
    lines.push("- Groupe B : code viewer Monaco/pre + spinner (MethodsViewer, DiagramViewer, FileCodeView)");
    lines.push("- Groupe C : liste items collapsible + code (ContextViewer, SymbolsView, FullPlanIssueTree)");
    lines.push("- Groupe D : streaming logs + status bar (RunConsole, PlanBatchConsole, RoadmapChat, CssAnalysis)");
    lines.push("- Groupe E : onglets avec sous-composants (PlanPanel, IssueAnalysis, AgentConsole)");
    lines.push("- Groupe F : boutons workflow avec états (WorkflowBar, PushMergePanel, CommitPanel)");
    lines.push("- Groupe G : input compact + actions (TopBar, CommitPanel, ConsoleDrawer)");
    lines.push("");
    lines.push("FORMAT DE SORTIE OBLIGATOIRE");
    lines.push("");
    lines.push("## Hiérarchie proposée");
    lines.push("```");
    lines.push("src/lib/components/");
    lines.push("  layout/     # coquilles UI réutilisables");
    lines.push("  views/      # vues métier principales");
    lines.push("  agent/      # (exemple de sous-dossier)");
    lines.push("```");
    lines.push("Lister chaque fichier → dossier cible.");
    lines.push("");
    lines.push("## Candidats jgr-ui (par priorité)");
    lines.push("### JgrXxx");
    lines.push("- **Remplace :** fichiers sources concernés");
    lines.push("- **Pattern :** description de la structure HTML/CSS communes");
    lines.push("- **Props suggérées :** `prop1: type`, `prop2: type`, `snippet: children`");
    lines.push("- **Impact :** N composants allégés");
    lines.push("");
    lines.push("## Composants à scinder (domaine + coquille générique)");
    lines.push("Pour les composants qui mélangent shell générique et logique métier :");
    lines.push("### NomComposant.svelte");
    lines.push("- **Shell à extraire :** description");
    lines.push("- **Logique métier à garder :** description");
    lines.push("");
    lines.push("## Composants déjà agnostiques (prêts pour jgr-ui)");
    lines.push("Liste des composants qui pourraient migrer tels quels.");
    lines.push("");

    // Top 10 complets (script + résumé template)
    const TOP_FULL = 10;
    lines.push("COMPOSANTS — DÉTAIL COMPLET (top 10 par taille)");
    lines.push("");
    for (const c of components.slice(0, TOP_FULL)) {
        lines.push(`### ${c.path} (${c.lines} lignes)`);
        if (c.jgrUiImports.length) lines.push(`jgr-ui: ${c.jgrUiImports.join(", ")}`);
        if (c.localImports.length) lines.push(`imports locaux: ${c.localImports.join(", ")}`);
        if (c.templateComponents.length) lines.push(`composants utilisés: ${c.templateComponents.join(", ")}`);
        if (c.hasStreaming) lines.push(`⚡ streaming SSE`);
        if (c.hasEach) lines.push(`{#each} × ${c.hasEach}`);
        if (c.templateSummary) lines.push(`template: ${c.templateSummary}`);
        lines.push("```ts");
        lines.push(c.scriptContent.trim().slice(0, 800));
        if (c.scriptContent.trim().length > 800) lines.push("// ... (tronqué)");
        lines.push("```");
        lines.push("");
    }

    // Reste : métadonnées
    lines.push("COMPOSANTS — MÉTADONNÉES (reste)");
    for (const c of components.slice(TOP_FULL)) {
        const jgr = c.jgrUiImports.length ? ` | jgr-ui: ${c.jgrUiImports.join(",")}` : "";
        const loc = c.localImports.length ? ` | imports: ${c.localImports.join(",")}` : "";
        const tpl = c.templateComponents.length ? ` | <${c.templateComponents.join(",")}>` : "";
        const stream = c.hasStreaming ? " | ⚡SSE" : "";
        lines.push(`- ${c.path} (${c.lines}l)${jgr}${loc}${tpl}${stream}`);
        if (c.templateSummary) lines.push(`  ${c.templateSummary}`);
    }

    return lines.join("\n");
}
