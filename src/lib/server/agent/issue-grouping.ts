/**
 * Détection automatique de groupes d'issues partageant un mot-clé saillant.
 *
 * Algorithme :
 * 1. Tokeniser les titres (minuscules, suppression stopwords, longueur >= 3)
 * 2. Calculer la fréquence de chaque mot sur l'ensemble des titres
 * 3. Sélectionner les mots saillants : présents dans >= minIssues issues ET < maxFreqRatio des issues
 * 4. Pour chaque mot saillant : collecter les issues, créer un groupe candidat
 * 5. Fusionner les groupes ayant exactement les mêmes issues (plusieurs mots → un groupe)
 * 6. Filtrer pour ne garder que les groupes maximaux
 * 7. Score = nbIssues × log(fréquence), trier DESC
 */

export type IssueGroup = {
    keyword: string;       // mot-clé principal (ex : "token")
    keywords: string[];    // tous les mots-clés si fusion
    issues: { number: number; title: string }[];
    score: number;
    hasParent: boolean;    // true si une issue parente existe déjà (à remplir côté API)
};

// Stopwords FR + EN courants
const STOPWORDS = new Set([
    // FR
    "le", "la", "les", "de", "du", "des", "un", "une", "au", "aux",
    "en", "et", "ou", "par", "sur", "dans", "avec", "pour", "que", "qui",
    "ne", "pas", "plus", "est", "sont", "être", "avoir", "fait", "tout",
    "cette", "ces", "ce", "mon", "son", "ses", "mes", "leur", "leurs",
    "nous", "vous", "ils", "elles", "je", "tu", "il", "elle", "on",
    "lors", "lorsque", "après", "avant", "lors", "comme", "donc", "mais",
    // EN
    "the", "a", "an", "of", "in", "on", "at", "to", "for", "with",
    "and", "or", "but", "not", "is", "are", "was", "were", "be", "been",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "from", "as",
    "by", "if", "so", "no", "up", "out", "it", "its", "this", "that",
    "all", "any", "both", "each", "few", "more", "other", "some", "such",
    "into", "through", "during", "before", "after", "above", "below",
    "between", "own", "same", "than", "then", "once", "also", "just",
    "when", "where", "which", "while", "how", "what", "who",
]);

/** Tokenise un texte en mots saillants (longueur >= 3, sans stopwords) */
function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[\s\-_/\\.,;:!?()[\]{}"'`]+/)
        .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Détecte les groupes d'issues partageant un mot-clé saillant.
 *
 * @param issues        Liste des issues (number, title, body optionnel)
 * @param options.minIssues      Nombre minimum d'issues dans un groupe (défaut : 3)
 * @param options.maxFreqRatio   Fréquence max relative pour éviter les mots trop universels (défaut : 0.8)
 */
export function detectIssueGroups(
    issues: { number: number; title: string; body?: string | null }[],
    options?: { minIssues?: number; maxFreqRatio?: number }
): IssueGroup[] {
    const minIssues = options?.minIssues ?? 3;
    const maxFreqRatio = options?.maxFreqRatio ?? 0.8;
    const total = issues.length;

    if (total === 0) return [];

    // Étape 1 : tokeniser les titres de chaque issue
    const issueTokens: Map<number, Set<string>> = new Map();
    for (const issue of issues) {
        const tokens = new Set(tokenize(issue.title));
        issueTokens.set(issue.number, tokens);
    }

    // Étape 2 : calculer la fréquence de chaque mot (nombre d'issues qui le contiennent)
    const wordFreq: Map<string, number> = new Map();
    for (const tokens of issueTokens.values()) {
        for (const word of tokens) {
            wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
        }
    }

    // Étape 3 : sélectionner les mots saillants
    const salientWords = Array.from(wordFreq.entries())
        .filter(([, freq]) => freq >= minIssues && freq / total < maxFreqRatio)
        .map(([word]) => word);

    if (salientWords.length === 0) return [];

    // Étape 4 : pour chaque mot saillant, collecter les issues correspondantes
    const candidateGroups: Map<string, { number: number; title: string }[]> = new Map();
    for (const word of salientWords) {
        const matching = issues.filter(issue => issueTokens.get(issue.number)?.has(word));
        if (matching.length >= minIssues) {
            candidateGroups.set(word, matching.map(i => ({ number: i.number, title: i.title })));
        }
    }

    if (candidateGroups.size === 0) return [];

    // Étape 5 : fusionner les groupes ayant exactement les mêmes issues
    // Clé de déduplication = numéros triés
    type GroupEntry = { keywords: string[]; issues: { number: number; title: string }[] };
    const merged: Map<string, GroupEntry> = new Map();
    for (const [word, groupIssues] of candidateGroups) {
        const key = groupIssues.map(i => i.number).sort((a, b) => a - b).join(",");
        if (merged.has(key)) {
            merged.get(key)!.keywords.push(word);
        } else {
            merged.set(key, { keywords: [word], issues: groupIssues });
        }
    }

    // Étape 6 : filtrer pour ne garder que les groupes maximaux
    // Un groupe est non-maximal si ses issues sont un sous-ensemble strict d'un autre groupe
    const entries = Array.from(merged.values());
    const maximal = entries.filter(g => {
        const nums = new Set(g.issues.map(i => i.number));
        return !entries.some(other => {
            if (other === g) return false;
            const otherNums = new Set(other.issues.map(i => i.number));
            if (otherNums.size <= nums.size) return false;
            // g est-il un sous-ensemble strict de other ?
            return [...nums].every(n => otherNums.has(n));
        });
    });

    // Étape 7 : calculer le score et trier
    const result: IssueGroup[] = maximal.map(g => {
        const freq = wordFreq.get(g.keywords[0]) ?? g.issues.length;
        const score = g.issues.length * Math.log(freq + 1);
        return {
            keyword: g.keywords[0],
            keywords: g.keywords,
            issues: g.issues,
            score,
            hasParent: false,
        };
    });

    return result.sort((a, b) => b.score - a.score);
}
