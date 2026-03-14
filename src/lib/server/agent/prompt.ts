import fs from "fs";
import path from "path";
import type { AgentContext, MethodSnippet } from "./context";
import type { Skill } from "./skills";

export type PromptOptions = {
    /** Description longue de la tâche ou corps de l'issue GitHub */
    description?: string;
    /** Concepts métier du codebase : { NomConcept: "définition" } */
    conceptMap?: Record<string, string>;
    /** Ressources de documentation disponibles dans le projet */
    projectDocs?: ProjectDocs;
    /** Vue compressée de l'architecture du projet cible (générée par lolve-carto) */
    atlas?: string;
    /** Skill sélectionnée pour cette tâche (focus + contraintes injectés dans le prompt) */
    skill?: Skill;
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

/**
 * Formate un AgentContext en prompt texte complet prêt à envoyer à Claude.
 *
 * Format produit :
 *   TASK / DESCRIPTION / OBJECTIF / CONTRAINTES / FORMAT DU PLAN / DOCUMENTATION / CONCEPTS / SYMBOL MAP
 */
export function formatPrompt(ctx: AgentContext, opts: PromptOptions = {}): string {
    const { description, conceptMap, projectDocs, atlas, skill } = opts;
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

    // ── Skill sélectionnée ───────────────────────────────────────────────────
    if (skill) {
        lines.push("SKILL");
        lines.push(`${skill.label}`);
        lines.push(`Focus : ${skill.focus}`);
        lines.push("Contraintes :");
        for (const c of skill.constraints) lines.push(`- ${c}`);
        lines.push("");
    }

    // ── Atlas architectural du projet cible ───────────────────────────────────
    if (atlas) {
        lines.push("ATLAS");
        lines.push(atlas.trim());
        lines.push("");
    }

    // ── Concepts ─────────────────────────────────────────────────────────────
    if (conceptMap && Object.keys(conceptMap).length > 0) {
        lines.push("CONCEPTS");
        for (const [name, def] of Object.entries(conceptMap)) {
            lines.push(`${name} : ${def}`);
        }
        lines.push("");
    }

    return lines.join("\n");
}

/**
 * Formate le prompt d'implémentation enrichi avec le contexte (snippets de code).
 * Utilisé par /api/agent/run quand un plan est fourni.
 */
export function formatImplementationPrompt(
    task: { title: string },
    plan: string,
    methods: MethodSnippet[],
    docs?: ProjectDocs,
    atlas?: string
): string {
    const lines: string[] = [];

    lines.push("TASK");
    lines.push(task.title);
    lines.push("");

    lines.push("OBJECTIF");
    lines.push("Implémenter le plan ci-dessous étape par étape. Modifier le code dans le projet.");
    lines.push("Ne pas produire de plan. Réaliser directement les modifications.");
    lines.push("");

    // ── Atlas architectural du projet cible ───────────────────────────────────
    if (atlas) {
        lines.push("ATLAS");
        lines.push(atlas.trim());
        lines.push("");
    }

    if (methods.length > 0) {
        lines.push("CODE PERTINENT");
        const byFile = new Map<string, MethodSnippet[]>();
        for (const m of methods) {
            if (!byFile.has(m.file)) byFile.set(m.file, []);
            byFile.get(m.file)!.push(m);
        }
        for (const [file, items] of byFile) {
            lines.push(`\n## ${file}`);
            for (const m of items) {
                lines.push(`### ${m.key}${m.description ? `  — ${m.description}` : ""}`);
                lines.push("```");
                lines.push(m.snippet);
                lines.push("```");
            }
        }
        lines.push("");
    }

    if (docs) {
        const docLines: string[] = [];
        for (const f of docs.agents) docLines.push(`- Agent expert : ${f}`);
        for (const f of docs.theoryFiles) docLines.push(`- Théorie : ${f}`);
        if (docLines.length > 0) {
            lines.push("DOCUMENTATION");
            lines.push(...docLines);
            lines.push("");
        }
    }

    lines.push("NAVIGATION CARTOGRAPHIE");
    lines.push("Les endpoints suivants permettent d'explorer le code du projet :");
    lines.push("POST /api/cartography { query }        → trouver des méthodes par sémantique");
    lines.push("GET  /api/cartography/snippet?key=...  → obtenir le code précis d'une méthode");
    lines.push("POST /api/cartography/refresh          → mettre à jour l'index après modification");
    lines.push("INTERDIT : ls -R, grep, find, cat pour naviguer le code source");
    lines.push("");

    lines.push("PLAN APPROUVÉ");
    lines.push(plan);

    return lines.join("\n");
}
