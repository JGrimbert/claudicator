import { createRequire } from "module";
import fs from "fs";
import path from "path";
import type { Task } from "../services/tasks";
import { formatPrompt, loadConceptMap, loadProjectDocs } from "./prompt";

// Chemin vers lolve-cartography (configurable via LC_PATH dans .env)
const LC_PATH = process.env.LC_PATH ?? "C:/lolve-cartography";

const require = createRequire(import.meta.url);
const { buildCallGraph } = require(`${LC_PATH}/lib/call-graph.cjs`) as {
    buildCallGraph: (srcPath: string, knownClasses: Set<string>) => Record<string, string[]>;
};

export type SymbolGroup = { file?: string; sigs: string[] };

export type AgentContext = {
    task: { id: string; title: string };
    symbolMap: Record<string, SymbolGroup>;
    prompt: string;
};

// ─── Stopwords FR + EN ───────────────────────────────────────────────────────
const STOPWORDS = new Set([
    'le','la','les','un','une','des','de','du','et','ou','est','sont','dans','par',
    'pour','sur','avec','en','qui','que','il','elle','ils','elles','nous','vous',
    'ce','se','sa','son','ses','mon','ton','leur','peut','doit','fait','pas','plus',
    'bien','tout','comme','car','mais','lors','donc','puis','aussi','apres','avant',
    'the','a','an','and','or','is','are','in','for','with','to','of','from','at',
    'by','be','has','have','it','this','that','not','but','on','as','do','so','if',
    'up','get','set','new','can','its','was','will','been','when','how','what',
    'which','who','all','any'
]);

/** Extrait les mots-clés significatifs d'un titre (stopwords supprimés). */
function extractKeywords(title: string): string[] {
    return title
        .toLowerCase()
        .split(/[\s\-_/.,;:!?()[\]{}'"«»]+/)
        .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

/** Découpe un nom camelCase en parties : useFocusedMap → ['use','focused','map']. */
function camelParts(name: string): string[] {
    return name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .toLowerCase()
        .split(/[\s_]+/)
        .filter(Boolean);
}

type MethodEntry = { isPrivate?: boolean; signature?: string; description?: string; file?: string; role?: string };

const ROLE_SCORE: Record<string, number> = {
    entry: 3, core: 2, service: 1, flow: 1, bridge: 1
};

/** Charge l'annotation-cache depuis .cache/annotation-cache.json. */
function loadAnnotCache(projectRoot: string): Record<string, { role?: string; description?: string }> {
    const p = path.join(projectRoot, ".cache", "annotation-cache.json");
    try {
        return JSON.parse(fs.readFileSync(p, "utf-8")).annotations ?? {};
    } catch { return {}; }
}

/**
 * Score un symbole individuel contre les mots-clés de la tâche.
 *   kwScore (filtre strict) :
 *     +5 : un mot-clé correspond à un part camelCase du nom
 *     +3 : un mot-clé apparaît dans la signature (paramètres)
 *     +1 : un mot-clé apparaît dans la description JSDoc
 *   roleBonus (départage uniquement) :
 *     +ROLE_SCORE[role] : bonus selon le rôle de la méthode
 *
 * Un symbole n'est inclus que si kwScore > 0.
 * Le rôle ne peut pas seul justifier l'inclusion dans le SYMBOL MAP.
 */
function scoreSymbol(key: string, method: MethodEntry, keywords: string[]): { kwScore: number; total: number } {
    if (!keywords.length) return { kwScore: 0, total: 0 };
    const rawName  = key.split('.').pop() ?? key;
    const parts    = camelParts(rawName);
    const sigLower = (method.signature ?? '').toLowerCase();
    const descLow  = (method.description ?? '').toLowerCase();

    let kwScore = 0;
    for (const kw of keywords) {
        if (parts.includes(kw))    kwScore += 5;
        if (sigLower.includes(kw)) kwScore += 3;
        if (descLow.includes(kw))  kwScore += 1;
    }
    const roleBonus = method.role ? (ROLE_SCORE[method.role] ?? 0) : 0;
    return { kwScore, total: kwScore + roleBonus };
}

const SYMBOL_MAP_MAX = 15;

/**
 * Lit le method-index.json, score chaque symbole contre le titre de la tâche,
 * et retourne les SYMBOL_MAP_MAX plus pertinents.
 * Fonctionne aussi bien pour les méthodes de classe que les fonctions standalone.
 */
export function loadSymbolMap(projectRoot: string, query: string): Record<string, SymbolGroup> {
    const indexPath = path.join(projectRoot, ".cache", "method-index.json");
    try {
        const raw = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        const methods: Record<string, MethodEntry> = raw.methods ?? {};
        const annotCache = loadAnnotCache(projectRoot);

        // Merger les annotations (role, description) dans les méthodes
        for (const [key, method] of Object.entries(methods)) {
            const cached = annotCache[key];
            if (cached) {
                method.role ??= cached.role;
                method.description ??= cached.description;
            }
        }
        const keywords = extractKeywords(query);

        // 1. Scorer chaque symbole individuellement
        const scored = Object.entries(methods)
            .filter(([, m]) => !m.isPrivate)
            .map(([key, method]) => ({ key, method, ...scoreSymbol(key, method, keywords) }))
            .sort((a, b) => b.total - a.total);

        // 2. Garder uniquement les symboles avec au moins un match de mot-clé.
        //    Le rôle seul ne suffit pas à justifier l'inclusion (évite le bruit).
        const selected = scored.filter(s => s.kwScore > 0).slice(0, SYMBOL_MAP_MAX);

        // 3. Construire le map : méthode de classe → grouper sous la classe
        //    fonction standalone → clé = nom de la fonction
        const map: Record<string, SymbolGroup> = {};
        for (const { key, method } of selected) {
            const parts = key.split('.');
            const cls   = parts.length > 1 ? parts[0] : key;
            const sig   = method.signature ?? parts.at(-1) ?? key;
            if (!map[cls]) map[cls] = { file: method.file, sigs: [] };
            if (!map[cls].sigs.includes(sig)) map[cls].sigs.push(sig);
        }
        return map;
    } catch {
        return {};
    }
}

/**
 * Après le call graph, ajoute les callees directs des symboles sélectionnés
 * pour fournir le voisinage structurel (+2 score implicite).
 * Limite l'expansion pour ne pas dépasser SYMBOL_MAP_MAX.
 */
function expandWithCallees(
    symbolMap: Record<string, SymbolGroup>,
    callGraph: Record<string, string[]>,
    allMethods: Record<string, MethodEntry>
): void {
    const budget = SYMBOL_MAP_MAX - Object.values(symbolMap).flatMap(g => g.sigs).length;
    if (budget <= 0) return;

    let added = 0;
    for (const callees of Object.values(callGraph)) {
        for (const callee of callees) {
            if (added >= budget) return;
            const parts = callee.split('.');
            const cls   = parts[0];
            const m     = allMethods[callee];
            const sig   = m?.signature ?? parts.at(-1) ?? callee;
            if (!symbolMap[cls]) symbolMap[cls] = { file: m?.file, sigs: [] };
            if (!symbolMap[cls].sigs.includes(sig)) {
                symbolMap[cls].sigs.push(sig);
                added++;
            }
        }
    }
}

/**
 * Assemble le contexte agent pour une tâche donnée.
 * @param task        - La tâche sélectionnée (id + title)
 * @param projectRoot - Racine du projet cible analysé par lolve-cartography
 * @param description - Corps de l'issue GitHub associée (optionnel)
 */
export function buildContext(task: Pick<Task, "id" | "title">, projectRoot: string, description?: string): AgentContext {
    const symbolMap = loadSymbolMap(projectRoot, task.title);
    const knownClasses = new Set(Object.keys(symbolMap));

    const srcPath = path.join(projectRoot, "src");
    const callGraph = knownClasses.size > 0
        ? buildCallGraph(srcPath, knownClasses)
        : {};

    // Expand symbol map avec les callees directs (voisinage structurel)
    if (Object.keys(callGraph).length > 0) {
        const indexPath = path.join(projectRoot, ".cache", "method-index.json");
        try {
            const allMethods = JSON.parse(fs.readFileSync(indexPath, "utf-8")).methods ?? {};
            expandWithCallees(symbolMap, callGraph, allMethods);
        } catch { /* silencieux */ }
    }

    const ctx = {
        task: { id: task.id, title: task.title },
        symbolMap,
        prompt: ""
    };

    const conceptMap  = loadConceptMap(projectRoot) ?? undefined;
    const projectDocs = loadProjectDocs(projectRoot);
    ctx.prompt = formatPrompt(ctx, { description, conceptMap, projectDocs });

    return ctx;
}
