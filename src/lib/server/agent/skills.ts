import type { SemanticRegion } from './segments';

export type SkillId = 'ui' | 'domain' | 'api' | 'infra' | 'test' | 'full-stack';

export type Skill = {
    id:          SkillId;
    label:       string;
    regions:     SemanticRegion[];
    constraints: string[];
    focus:       string;
};

export const SKILL_REGISTRY: Record<SkillId, Skill> = {
    ui: {
        id: 'ui',
        label: 'UI / Composants',
        regions: ['ui', 'store'],
        focus: 'layout, réactivité, composabilité Svelte, stores',
        constraints: [
            'Respecter la réactivité Svelte ($:, stores)',
            'Préférer les composants atomiques réutilisables',
            'Ne pas introduire de logique serveur dans les composants',
        ],
    },
    api: {
        id: 'api',
        label: 'API / Contrats',
        regions: ['api'],
        focus: "contrats d'API, schémas, versionning, validation des entrées",
        constraints: [
            'Valider toutes les entrées côté serveur',
            'Retourner des erreurs HTTP sémantiques (400/404/500)',
            'Documenter les endpoints modifiés',
        ],
    },
    domain: {
        id: 'domain',
        label: 'Logique Métier',
        regions: ['domain'],
        focus: 'invariants, règles, orchestration agent',
        constraints: [
            'Ne pas coupler la logique métier aux routes',
            'Conserver la séparation planning / implémentation / review',
        ],
    },
    infra: {
        id: 'infra',
        label: 'Infrastructure / Services',
        regions: ['infra'],
        focus: 'intégrité de configuration, services externes, git, GitHub',
        constraints: [
            'Garder le code serveur dans src/lib/server/',
            'Ne jamais exposer de tokens ou secrets',
        ],
    },
    test: {
        id: 'test',
        label: 'Tests',
        regions: ['tests'],
        focus: "couverture, cas limites, non-régression",
        constraints: [
            "Couvrir les cas nominaux et les cas d'erreur",
            'Ne pas mocker les dépendances internes sans raison',
        ],
    },
    'full-stack': {
        id: 'full-stack',
        label: 'Full Stack',
        regions: ['ui', 'domain', 'api', 'infra', 'store'],
        focus: 'cohérence bout-en-bout, contrats UI/API/DB',
        constraints: [
            'Assurer la cohérence des types entre client et serveur',
            'Garder la séparation UI / serveur',
        ],
    },
};

/**
 * Sélectionne la skill la plus adaptée aux régions touchées.
 * Si plusieurs régions distinctes → full-stack.
 * Si une seule → skill correspondante.
 * Si aucune correspondance → domain par défaut.
 */
export function selectSkill(regions: SemanticRegion[]): Skill {
    const votes = new Map<SkillId, number>();
    for (const [id, skill] of Object.entries(SKILL_REGISTRY) as [SkillId, Skill][]) {
        const count = regions.filter(r => (skill.regions as string[]).includes(r)).length;
        if (count > 0) votes.set(id, count);
    }
    if (votes.size === 0) return SKILL_REGISTRY['domain'];
    if (votes.size > 1)  return SKILL_REGISTRY['full-stack'];
    const [[winner]] = [...votes.entries()].sort((a, b) => b[1] - a[1]);
    return SKILL_REGISTRY[winner];
}
