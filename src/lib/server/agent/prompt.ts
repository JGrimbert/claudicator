import fs from "fs";
import path from "path";
import type { AgentContext } from "./context";

export type PromptOptions = {
    /** Description longue de la tâche ou corps de l'issue GitHub */
    description?: string;
    /** Concepts métier du codebase : { NomConcept: "définition" } */
    conceptMap?: Record<string, string>;
    /** Ressources de documentation disponibles dans le projet */
    projectDocs?: ProjectDocs;
};

export type ProjectDocs = {
    /** Fichiers agents experts : .claude/agents/*.md */
    agents: string[];
    /** Fichiers de théorie/concepts : theory/* */
    theoryFiles: string[];
    /** Map UML disponible dans .cache/project-diagram.md */
    hasDiagram: boolean;
};

/**
 * Charge le concept map depuis un fichier concepts.json à la racine du projet cible.
 * Retourne null si absent (optionnel).
 */
export function loadConceptMap(projectRoot: string): Record<string, string> | null {
    const p = path.join(projectRoot, "concepts.json");
    try {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {
        return null;
    }
}

/** Charge le project-diagram.md (30 premières lignes). Retourne null si absent. */
export function loadProjectDiagram(projectRoot: string): string | null {
    const p = path.join(projectRoot, ".cache", "project-diagram.md");
    try {
        const content = fs.readFileSync(p, "utf-8");
        return content.split("\n").slice(0, 30).join("\n");
    } catch {
        return null;
    }
}

/**
 * Détecte les ressources de documentation disponibles dans le projet cible.
 * Les chemins retournés sont relatifs à la racine du projet.
 */
export function loadProjectDocs(projectRoot: string): ProjectDocs {
    const agents: string[] = [];
    const theoryFiles: string[] = [];

    try {
        const agentsDir = path.join(projectRoot, ".claude", "agents");
        for (const f of fs.readdirSync(agentsDir)) {
            if (f.endsWith(".md")) agents.push(`.claude/agents/${f}`);
        }
    } catch { /* absent */ }

    try {
        const theoryDir = path.join(projectRoot, "theory");
        for (const f of fs.readdirSync(theoryDir)) {
            theoryFiles.push(`theory/${f}`);
        }
    } catch { /* absent */ }

    const hasDiagram = fs.existsSync(path.join(projectRoot, ".cache", "project-diagram.md"));

    return { agents, theoryFiles, hasDiagram };
}

/** Dérive la catégorie d'un symbole depuis son chemin de fichier. */
function srcCategory(file: string): string {
    const norm = file.replace(/\\/g, '/');
    if (/\/composables\//i.test(norm)) return 'composable';
    if (/\/components\//i.test(norm))  return 'component';
    if (/\/prima\//i.test(norm))       return 'prima';
    if (/\/stores?\//i.test(norm))     return 'store';
    if (/\/utils?\//i.test(norm))      return 'util';
    if (/\/data\//i.test(norm))        return 'data';
    return '';
}

/**
 * Formate un AgentContext en prompt texte complet prêt à envoyer à Claude.
 *
 * Format produit :
 *   TASK / DESCRIPTION / OBJECTIF / CONTRAINTES / FORMAT DU PLAN / DOCUMENTATION / CONCEPTS / SYMBOL MAP
 */
export function formatPrompt(ctx: AgentContext, opts: PromptOptions = {}): string {
    const { description, conceptMap, projectDocs } = opts;
    const lines: string[] = [];

    // ── En-tête ──────────────────────────────────────────────────────────────
    lines.push("TASK");
    lines.push(ctx.task.title);
    lines.push("");

    if (description) {
        lines.push("DESCRIPTION");
        lines.push(description.trim());
        lines.push("");
    }

    // ── Objectif ─────────────────────────────────────────────────────────────
    lines.push("OBJECTIF");
    lines.push("Créer un plan détaillé pour réaliser la tâche ci-dessus.");
    lines.push("Ne pas coder. Produire uniquement le plan.");
    lines.push("");

    // ── Contraintes ───────────────────────────────────────────────────────────
    lines.push("CONTRAINTES");
    lines.push("Le plan doit inclure :");
    lines.push("- identification des usages");
    lines.push("- étapes de migration si nécessaire");
    lines.push("- vérifications pour éviter les régressions");
    lines.push("");

    // ── Format du plan ────────────────────────────────────────────────────────
    lines.push("FORMAT DU PLAN");
    lines.push("1. Analyse du problème");
    lines.push("2. Localisation des usages");
    lines.push("3. Stratégie de remplacement si nécessaire");
    lines.push("4. Étapes de modification du code");
    lines.push("5. Vérifications et nettoyage final");
    lines.push("");

    // ── Documentation disponible ──────────────────────────────────────────────
    if (projectDocs) {
        const docLines: string[] = [];
        if (projectDocs.hasDiagram) {
            docLines.push("- Map UML du projet : .cache/project-diagram.md");
        }
        for (const f of projectDocs.agents) {
            docLines.push(`- Agent expert : ${f}`);
        }
        for (const f of projectDocs.theoryFiles) {
            docLines.push(`- Théorie / concepts métier : ${f}`);
        }
        if (docLines.length > 0) {
            lines.push("DOCUMENTATION");
            lines.push("Les ressources suivantes sont disponibles et consultables :");
            lines.push(...docLines);
            lines.push("");
        }
    }

    // ── Concepts ─────────────────────────────────────────────────────────────
    if (conceptMap && Object.keys(conceptMap).length > 0) {
        lines.push("CONCEPTS");
        for (const [name, def] of Object.entries(conceptMap)) {
            lines.push(`${name} : ${def}`);
        }
        lines.push("");
    }

    // ── Symbol Map ───────────────────────────────────────────────────────────
    if (Object.keys(ctx.symbolMap).length > 0) {
        lines.push("SYMBOL MAP");
        for (const [cls, group] of Object.entries(ctx.symbolMap).sort()) {
            const filePath = group.file ? group.file.replace(/\\/g, '/') : '';
            const cat      = filePath ? srcCategory(filePath) : '';
            const meta     = [cat, filePath].filter(Boolean).join(' · ');
            lines.push(meta ? `${cls}  [${meta}]` : cls);
            for (const sig of group.sigs) lines.push(`  ${sig}`);
        }
        lines.push("");
    }

    return lines.join("\n");
}
