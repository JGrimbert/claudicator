import fs from "fs";
import path from "path";
import type { AgentContext } from "./context";

export type PromptOptions = {
    /** Description longue de la tâche ou corps de l'issue GitHub */
    description?: string;
    /** Concepts métier du codebase : { NomConcept: "définition" } */
    conceptMap?: Record<string, string>;
    /** Limite d'arêtes affichées par entrée du call graph */
    maxCallees?: number;
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

/**
 * Formate un AgentContext en prompt texte complet prêt à envoyer à Claude.
 *
 * Format produit :
 *   TASK / DESCRIPTION / OBJECTIF / CONCEPTS / SYMBOL MAP / CALL GRAPH
 */
export function formatPrompt(ctx: AgentContext, opts: PromptOptions = {}): string {
    const { description, conceptMap, maxCallees = 5 } = opts;
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

    lines.push("OBJECTIF");
    lines.push("Créer un plan détaillé en plusieurs étapes pour réaliser la tâche ci-dessus.");
    lines.push("Ne pas coder. Produire uniquement le plan.");
    lines.push("");

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
        for (const [cls, sigs] of Object.entries(ctx.symbolMap).sort()) {
            lines.push(cls);
            for (const sig of sigs) lines.push(`  ${sig}`);
        }
        lines.push("");
    }

    // ── Call Graph ───────────────────────────────────────────────────────────
    if (Object.keys(ctx.callGraph).length > 0) {
        lines.push("CALL GRAPH");
        for (const [caller, callees] of Object.entries(ctx.callGraph).sort()) {
            lines.push(caller);
            for (const c of callees.slice(0, maxCallees)) lines.push(`  → ${c}`);
        }
        lines.push("");
    }

    return lines.join("\n");
}
