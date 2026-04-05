import { describe, it, expect } from 'vitest'
import { scoreTier, depsToRoadmapData } from './IssueGroups.helpers'

// ── scoreTier ──────────────────────────────────────────────────────────────

describe('scoreTier', () => {
    it('retourne "hot" quand le ratio >= 0.7', () => {
        expect(scoreTier(7, 10)).toBe('hot')
        expect(scoreTier(10, 10)).toBe('hot')
    })

    it('retourne "warm" quand le ratio est entre 0.35 et 0.7 exclu', () => {
        expect(scoreTier(3.5, 10)).toBe('warm')
        expect(scoreTier(5, 10)).toBe('warm')
        expect(scoreTier(6.9, 10)).toBe('warm')
    })

    it('retourne "cool" quand le ratio < 0.35', () => {
        expect(scoreTier(0, 10)).toBe('cool')
        expect(scoreTier(3.4, 10)).toBe('cool')
    })

    it('retourne "cool" quand maxScore est 0 (évite la division par zéro)', () => {
        expect(scoreTier(0, 0)).toBe('cool')
        expect(scoreTier(5, 0)).toBe('cool')
    })
})

// ── depsToRoadmapData ──────────────────────────────────────────────────────

describe('depsToRoadmapData', () => {
    const issues = [
        { number: 1, title: 'Initialiser le projet' },
        { number: 2, title: 'Configurer la base de données' },
        { number: 3, title: 'Implémenter l\'API' },
    ]

    it('retourne un RoadmapData avec le bon nombre de steps', () => {
        const result = depsToRoadmapData(issues, [], {})
        expect(result.steps).toHaveLength(3)
    })

    it('mappe correctement les ids et labels', () => {
        const result = depsToRoadmapData(issues, [], {})
        expect(result.steps[0].id).toBe(1)
        expect(result.steps[0].label).toBe('#1')
        expect(result.steps[1].id).toBe(2)
    })

    it('affecte le skill "flow" pour les issues complexes', () => {
        const result = depsToRoadmapData(issues, [], { '1': 'complexe' })
        expect(result.steps[0].skill).toBe('flow')
    })

    it('affecte le skill "domain" pour les issues moyennes (par défaut)', () => {
        const result = depsToRoadmapData(issues, [], {})
        expect(result.steps[0].skill).toBe('domain')
    })

    it('affecte le skill "utility" pour les issues simples', () => {
        const result = depsToRoadmapData(issues, [], { '1': 'simple' })
        expect(result.steps[0].skill).toBe('utility')
    })

    it('reconstruit correctement les dépendances inverses', () => {
        // issue 2 dépend de 1 (1 → 2 = from:1, to:[2])
        const deps = [{ from: 1, to: [2] }]
        const result = depsToRoadmapData(issues, deps, {})
        const step2 = result.steps.find(s => s.id === 2)!
        expect(step2.dependsOnSteps).toContain(1)
    })

    it('calcule correctement les stats (nodes, edges)', () => {
        const deps = [{ from: 1, to: [2, 3] }]
        const result = depsToRoadmapData(issues, deps, {})
        expect(result.stats.nodes).toBe(3)
        expect(result.stats.edges).toBe(2)
        expect(result.stats.steps).toBe(3)
    })

    it('tronque les titres longs à 40 caractères dans nodes', () => {
        const longTitle = 'A'.repeat(50)
        const r = depsToRoadmapData([{ number: 99, title: longTitle }], [], {})
        expect(r.steps[0].nodes[0]).toHaveLength(40)
    })

    it('retourne un tableau vide pour issues vide', () => {
        const result = depsToRoadmapData([], [], {})
        expect(result.steps).toHaveLength(0)
        expect(result.stats.nodes).toBe(0)
    })
})
