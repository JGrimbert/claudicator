import { createRequire } from "module";
import fs from "fs";
import path from "path";
import type { Task } from "../services/tasks";
import { formatPrompt, loadConceptMap } from "./prompt";

// Chemin vers lolve-cartography (configurable via LC_PATH dans .env)
const LC_PATH = process.env.LC_PATH ?? "C:/lolve-cartography";

const require = createRequire(import.meta.url);
const { buildCallGraph } = require(`${LC_PATH}/lib/call-graph.cjs`) as {
    buildCallGraph: (srcPath: string, knownClasses: Set<string>) => Record<string, string[]>;
};

export type AgentContext = {
    task: { id: string; title: string };
    symbolMap: Record<string, string[]>;
    callGraph: Record<string, string[]>;
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

type MethodEntry = { isPrivate?: boolean; signature?: string; description?: string; file?: string };

/**
 * Score un symbole individuel contre les mots-clés de la tâche.
 *   +5 : un mot-clé correspond à un part camelCase du nom
 *   +3 : un mot-clé apparaît dans la signature (paramètres)
 *   +1 : un mot-clé apparaît dans la description JSDoc
 */
function scoreSymbol(key: string, method: MethodEntry, keywords: string[]): number {
    if (!keywords.length) return 0;
    const rawName  = key.split('.').pop() ?? key;
    const parts    = camelParts(rawName);
    const sigLower = (method.signature ?? '').toLowerCase();
    const descLow  = (method.description ?? '').toLowerCase();

    let score = 0;
    for (const kw of keywords) {
        if (parts.includes(kw))    score += 5;
        if (sigLower.includes(kw)) score += 3;
        if (descLow.includes(kw))  score += 1;
    }
    return score;
}

const SYMBOL_MAP_MAX = 15;

/**
 * Lit le method-index.json, score chaque symbole contre le titre de la tâche,
 * et retourne les SYMBOL_MAP_MAX plus pertinents.
 * Fonctionne aussi bien pour les méthodes de classe que les fonctions standalone.
 */
function loadSymbolMap(projectRoot: string, query: string): Record<string, string[]> {
    const indexPath = path.join(projectRoot, ".cache", "method-index.json");
    try {
        const raw = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        const methods: Record<string, MethodEntry> = raw.methods ?? {};
        const keywords = extractKeywords(query);

        // 1. Scorer chaque symbole individuellement
        const scored = Object.entries(methods)
            .filter(([, m]) => !m.isPrivate)
            .map(([key, method]) => ({ key, method, score: scoreSymbol(key, method, keywords) }))
            .sort((a, b) => b.score - a.score);

        // 2. Garder les top SYMBOL_MAP_MAX (si aucun score, fallback alphabétique)
        const withScore = scored.filter(s => s.score > 0);
        const selected  = (withScore.length > 0 ? withScore : scored).slice(0, SYMBOL_MAP_MAX);

        // 3. Construire le map : méthode de classe → grouper sous la classe
        //    fonction standalone → clé = nom de la fonction
        const map: Record<string, string[]> = {};
        for (const { key, method } of selected) {
            const parts = key.split('.');
            const cls   = parts.length > 1 ? parts[0] : key;
            const sig   = method.signature ?? parts.at(-1) ?? key;
            if (!map[cls]) map[cls] = [];
            if (!map[cls].includes(sig)) map[cls].push(sig);
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
    symbolMap: Record<string, string[]>,
    callGraph: Record<string, string[]>,
    allMethods: Record<string, MethodEntry>
): void {
    const budget = SYMBOL_MAP_MAX - Object.values(symbolMap).flat().length;
    if (budget <= 0) return;

    let added = 0;
    for (const callees of Object.values(callGraph)) {
        for (const callee of callees) {
            if (added >= budget) return;
            const parts = callee.split('.');
            const cls   = parts[0];
            const sig   = allMethods[callee]?.signature ?? parts.at(-1) ?? callee;
            if (!symbolMap[cls]) symbolMap[cls] = [];
            if (!symbolMap[cls].includes(sig)) {
                symbolMap[cls].push(sig);
                added++;
            }
        }
    }
}

/**
 * Assemble le contexte agent pour une tâche donnée.
 * @param task  - La tâche sélectionnée (id + title)
 * @param projectRoot - Racine du projet cible analysé par lolve-cartography
 */
export function buildContext(task: Pick<Task, "id" | "title">, projectRoot: string): AgentContext {
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
        callGraph,
        prompt: ""
    };

    const conceptMap = loadConceptMap(projectRoot) ?? undefined;
    ctx.prompt = formatPrompt(ctx, { conceptMap });

    return ctx;
}
