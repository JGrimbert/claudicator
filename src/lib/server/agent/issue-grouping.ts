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
    twins: number[][];     // groupes d'issues au sujet identique, ex: [[12,34],[56,78]]
    subdivisions: {
        keyword: string;
        keywords: string[];
        issues: { number: number; title: string }[];
    }[];
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

/**
 * Construit des classes d'équivalence parmi les stems.
 * Deux stems sont fusionnés si :
 *   - préfixe commun >= 6 chars  (ex : "orchestration" ~ "orchestrateur")
 *   - l'un commence ou finit par l'autre, longueur min 4 chars
 *     (ex : "repo" ~ "multirepo", "graph" ~ "skillgraph")
 * Retourne une map stem → stem canonique (le plus fréquent ; à égalité, le plus court).
 */
function mergeEquivalentStems(
    stems: string[],
    wordFreq: Map<string, number>,
): Map<string, string> {
    const parent = new Map<string, string>(stems.map(s => [s, s]));

    function find(s: string): string {
        let root = s;
        while (parent.get(root) !== root) root = parent.get(root)!;
        let cur = s;
        while (cur !== root) { const next = parent.get(cur)!; parent.set(cur, root); cur = next; }
        return root;
    }

    function union(a: string, b: string) {
        const ra = find(a), rb = find(b);
        if (ra === rb) return;
        const fa = wordFreq.get(ra) ?? 0;
        const fb = wordFreq.get(rb) ?? 0;
        if (fa > fb || (fa === fb && ra.length <= rb.length)) parent.set(rb, ra);
        else parent.set(ra, rb);
    }

    for (let i = 0; i < stems.length; i++) {
        for (let j = i + 1; j < stems.length; j++) {
            const a = stems[i], b = stems[j];
            const shorter = a.length <= b.length ? a : b;
            const longer  = a.length <= b.length ? b : a;

            // Préfixe commun >= 6 chars (variantes morphologiques)
            if (shorter.length >= 6) {
                let plen = 0;
                while (plen < shorter.length && a[plen] === b[plen]) plen++;
                if (plen >= 6) { union(a, b); continue; }
            }

            // Mot composé : le plus court est un composant en tête ou en queue (min 4 chars)
            if (shorter.length >= 4 && (longer.startsWith(shorter) || longer.endsWith(shorter))) {
                union(a, b);
            }
        }
    }

    return new Map(stems.map(s => [s, find(s)]));
}

/** Normalise un mot vers sa forme racine pour regrouper pluriels/singuliers */
function stem(word: string): string {
    if (word.length <= 3) return word;
    if (word.endsWith('ations')) return word.slice(0, -1);   // validations → validation
    if (word.endsWith('ies'))   return word.slice(0, -3) + 'y';
    if (word.endsWith('ves'))   return word.slice(0, -3) + 'f';
    if (word.endsWith('s'))     return word.slice(0, -1);
    if (word.endsWith('x') && word.length >= 5) return word.slice(0, -1);
    return word;
}

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

    // Étape 1 : tokeniser les titres — Map<issueNumber, Map<stem, tokenOriginal>>
    const issueTokens: Map<number, Map<string, string>> = new Map();
    for (const issue of issues) {
        const tokenMap = new Map<string, string>();
        for (const w of tokenize(issue.title)) {
            const s = stem(w);
            if (!tokenMap.has(s)) tokenMap.set(s, w); // garde la première forme rencontrée
        }
        issueTokens.set(issue.number, tokenMap);
    }

    // Étape 2 : calculer la fréquence de chaque stem (nombre d'issues qui le contiennent)
    const wordFreq: Map<string, number> = new Map();
    for (const tokenMap of issueTokens.values()) {
        for (const s of tokenMap.keys()) {
            wordFreq.set(s, (wordFreq.get(s) ?? 0) + 1);
        }
    }

    // Étape 2b : fusionner les stems morphologiquement équivalents
    const stemToCanonical = mergeEquivalentStems(Array.from(wordFreq.keys()), wordFreq);

    // Reconstruire les tokens par issue avec stems canoniques
    const issueCanonicals: Map<number, Map<string, string>> = new Map();
    for (const [num, tokenMap] of issueTokens) {
        const cmap = new Map<string, string>();
        for (const [s, raw] of tokenMap) {
            const canon = stemToCanonical.get(s) ?? s;
            if (!cmap.has(canon)) cmap.set(canon, raw);
        }
        issueCanonicals.set(num, cmap);
    }

    // Fréquence par stem canonique
    const canonicalFreq: Map<string, number> = new Map();
    for (const cmap of issueCanonicals.values()) {
        for (const canon of cmap.keys()) {
            canonicalFreq.set(canon, (canonicalFreq.get(canon) ?? 0) + 1);
        }
    }

    // Étape 3 : sélectionner les stems canoniques saillants
    const salientWords = Array.from(canonicalFreq.entries())
        .filter(([, freq]) => freq >= minIssues && freq / total < maxFreqRatio)
        .map(([word]) => word);

    if (salientWords.length === 0) return [];

    // Étape 4 : pour chaque stem canonique saillant, collecter les issues correspondantes
    const candidateGroups: Map<string, { number: number; title: string }[]> = new Map();
    for (const stemWord of salientWords) {
        const matching = issues.filter(issue => issueCanonicals.get(issue.number)?.has(stemWord));
        if (matching.length >= minIssues) {
            candidateGroups.set(stemWord, matching.map(i => ({ number: i.number, title: i.title })));
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

    // Étape 7 : calculer le score et choisir la forme originale la plus fréquente comme keyword affiché
    const result: IssueGroup[] = maximal.map(g => {
        const freq = canonicalFreq.get(g.keywords[0]) ?? g.issues.length;
        const score = g.issues.length * Math.log(freq + 1);

        // Pour chaque stem canonique du groupe, trouver la forme originale la plus fréquente
        const displayKeywords = g.keywords.map(canonKw => {
            const rawCounts = new Map<string, number>();
            for (const issue of g.issues) {
                const raw = issueCanonicals.get(issue.number)?.get(canonKw);
                if (raw) rawCounts.set(raw, (rawCounts.get(raw) ?? 0) + 1);
            }
            return [...rawCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? canonKw;
        });

        return {
            keyword: displayKeywords[0],
            keywords: displayKeywords,
            issues: g.issues,
            score,
            hasParent: false,
            twins: [],
            subdivisions: [],
        };
    });

    const sorted = result.sort((a, b) => b.score - a.score);

    // Calcul des jumeaux : issues dont l'empreinte tokenisée est identique
    for (const group of sorted) {
        const fingerprints = new Map<string, number[]>();
        for (const issue of group.issues) {
            const tokens = tokenize(issue.title).map(stem).sort();
            const fp = tokens.join("|");
            const existing = fingerprints.get(fp);
            if (existing) existing.push(issue.number);
            else fingerprints.set(fp, [issue.number]);
        }
        group.twins = Array.from(fingerprints.values()).filter(g => g.length >= 2);
    }

    // Calcul des subdivisions : sous-groupes pour les groupes larges
    for (const group of sorted) {
        const twinNums = new Set(group.twins.flat());
        // Garder un seul représentant par groupe de jumeaux
        const seenTwinFp = new Set<string>();
        const uniqueIssues = group.issues.filter(issue => {
            if (!twinNums.has(issue.number)) return true;
            const tokens = tokenize(issue.title).map(stem).sort();
            const fp = tokens.join("|");
            if (seenTwinFp.has(fp)) return false;
            seenTwinFp.add(fp);
            return true;
        });
        if (uniqueIssues.length <= 3) continue;

        const subs = detectIssueGroups(uniqueIssues, { minIssues: 2 });
        const parentNums = new Set(group.issues.map(i => i.number));
        const assignedNums = new Set<number>();
        const dedupedSubs: typeof subs = [];
        for (const sub of subs.sort((a, b) => b.issues.length - a.issues.length)) {
            const filtered = sub.issues.filter(i => !assignedNums.has(i.number));
            if (filtered.length < 2) continue;
            dedupedSubs.push({ ...sub, issues: filtered });
            for (const i of filtered) assignedNums.add(i.number);
        }
        group.subdivisions = dedupedSubs
            .filter(sub =>
                sub.issues.length < group.issues.length &&
                sub.issues.every(i => parentNums.has(i.number))
            )
            .map(sub => ({ keyword: sub.keyword, keywords: sub.keywords, issues: sub.issues }));
    }

    return sorted;
}
