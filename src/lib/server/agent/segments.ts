export type SemanticRegion = 'ui' | 'domain' | 'api' | 'infra' | 'tests' | 'config' | 'store';

const REGION_RULES: Array<{ pattern: RegExp; region: SemanticRegion }> = [
    { pattern: /src\/lib\/components\//,       region: 'ui' },
    { pattern: /src\/routes\/\+/,              region: 'ui' },
    { pattern: /src\/routes\/api\//,           region: 'api' },
    { pattern: /src\/lib\/server\/agent\//,    region: 'domain' },
    { pattern: /src\/lib\/server\/services\//, region: 'infra' },
    { pattern: /src\/lib\/stores\//,           region: 'store' },
    { pattern: /\.(test|spec)\.(ts|js)$/,      region: 'tests' },
    { pattern: /\.(config|env|md)$/,           region: 'config' },
];

export function classifyFile(filePath: string): SemanticRegion {
    const normalized = filePath.split('\\').join('/');
    for (const { pattern, region } of REGION_RULES) {
        if (pattern.test(normalized)) return region;
    }
    return 'domain';
}
