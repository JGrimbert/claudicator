export type SemanticRegion = 'ui' | 'domain' | 'api' | 'infra' | 'tests' | 'config' | 'store';

const REGION_RULES: Array<{ pattern: RegExp; region: SemanticRegion }> = [
    // UI — composants (SvelteKit, Vue, React…)
    { pattern: /\/components\//,               region: 'ui' },
    { pattern: /src\/routes\/\+/,              region: 'ui' },
    // API — routes serveur
    { pattern: /src\/routes\/api\//,           region: 'api' },
    // Domain — logique métier
    { pattern: /\/server\/agent\//,            region: 'domain' },
    { pattern: /\/prima\//,                    region: 'domain' },
    // Infrastructure — services externes, utilitaires
    { pattern: /\/server\/services\//,         region: 'infra' },
    { pattern: /\/services\//,                 region: 'infra' },
    { pattern: /\/utils\//,                    region: 'infra' },
    // Store — état réactif (Svelte stores, Vue composables)
    { pattern: /\/stores?\//,                  region: 'store' },
    { pattern: /\/composables\//,              region: 'store' },
    // Tests
    { pattern: /\.(test|spec)\.(ts|js)$/,      region: 'tests' },
    // Config
    { pattern: /\.(config|env|md)$/,           region: 'config' },
];

export function classifyFile(filePath: string): SemanticRegion {
    const normalized = filePath.split('\\').join('/');
    for (const { pattern, region } of REGION_RULES) {
        if (pattern.test(normalized)) return region;
    }
    return 'domain';
}
