import { describe, it, expect } from 'vitest'
import {
    groupIssuesByPlanGroup,
    candDeduplicateSubsets,
    candDeduplicateByJaccard,
    computeSkillCandidates,
} from './PlanPanel.helpers'
import type { SkillCandidate, CoalNode, HistCoalNode } from './PlanPanel.helpers'

// ── groupIssuesByPlanGroup ──────────────────────────────────────────────────

describe('groupIssuesByPlanGroup', () => {
    const groups = [
        { name: 'Étape A', issues: [1, 2, 3], index: 0, summary: '', dependsOn: [] },
        { name: 'Étape B', issues: [4, 5],    index: 1, summary: '', dependsOn: [] },
    ]

    it('retourne [] si issues est vide', () => {
        expect(groupIssuesByPlanGroup([], groups)).toEqual([])
    })

    it('retourne un seul groupe vide si groups est vide', () => {
        const result = groupIssuesByPlanGroup([7, 8], [])
        expect(result).toEqual([{ name: '', issues: [7, 8] }])
    })

    it('regroupe les issues par plan group', () => {
        const result = groupIssuesByPlanGroup([1, 2, 4], groups)
        const a = result.find(r => r.name === 'Étape A')
        const b = result.find(r => r.name === 'Étape B')
        expect(a?.issues).toEqual([1, 2])
        expect(b?.issues).toEqual([4])
    })

    it('met les issues sans groupe dans "autres"', () => {
        const result = groupIssuesByPlanGroup([1, 99], groups)
        const autres = result.find(r => r.name === 'autres')
        expect(autres?.issues).toContain(99)
    })

    it("n'inclut pas \"autres\" si toutes les issues sont couvertes", () => {
        const result = groupIssuesByPlanGroup([1, 4], groups)
        expect(result.find(r => r.name === 'autres')).toBeUndefined()
    })
})

// ── candDeduplicateSubsets ─────────────────────────────────────────────────

describe('candDeduplicateSubsets', () => {
    it('élimine les candidats dont les symboles sont un sous-ensemble d\'un autre', () => {
        const nodes: SkillCandidate[] = [
            { symbols: ['a', 'b', 'c'], count: 5, score: 10, source: 'coal' },
            { symbols: ['a', 'b'],      count: 4, score: 8,  source: 'coal' },
        ]
        const result = candDeduplicateSubsets(nodes)
        expect(result.length).toBe(1)
        expect(result[0].symbols).toEqual(['a', 'b', 'c'])
    })

    it('conserve les candidats disjoints', () => {
        const nodes: SkillCandidate[] = [
            { symbols: ['a', 'b'], count: 5, score: 10, source: 'coal' },
            { symbols: ['c', 'd'], count: 4, score: 8,  source: 'hist' },
        ]
        const result = candDeduplicateSubsets(nodes)
        expect(result.length).toBe(2)
    })

    it('retourne [] pour une entrée vide', () => {
        expect(candDeduplicateSubsets([])).toEqual([])
    })
})

// ── candDeduplicateByJaccard ───────────────────────────────────────────────

describe('candDeduplicateByJaccard', () => {
    it('conserve les candidats peu similaires (Jaccard < seuil)', () => {
        // inter=2, union=4 → 0.5 < 0.6 → conservé
        const nodes: SkillCandidate[] = [
            { symbols: ['a', 'b', 'c'], count: 5, score: 10, source: 'coal' },
            { symbols: ['a', 'b', 'd'], count: 4, score: 9,  source: 'coal' },
        ]
        const result = candDeduplicateByJaccard(nodes, 0.6)
        expect(result.length).toBe(2)
    })

    it('élimine quand Jaccard >= seuil', () => {
        // inter=3, union=4 → 0.75 >= 0.6 → éliminé
        const nodes: SkillCandidate[] = [
            { symbols: ['a', 'b', 'c'],       count: 5, score: 10, source: 'coal' },
            { symbols: ['a', 'b', 'c', 'd'],  count: 4, score: 9,  source: 'coal' },
        ]
        const result = candDeduplicateByJaccard(nodes, 0.6)
        expect(result.length).toBe(1)
    })

    it('retourne [] pour une entrée vide', () => {
        expect(candDeduplicateByJaccard([], 0.5)).toEqual([])
    })
})

// ── computeSkillCandidates ────────────────────────────────────────────────

describe('computeSkillCandidates', () => {
    const makeCoalNode = (symbols: string[], score: number, count: number): CoalNode => ({
        symbols: symbols.map(k => ({ key: k, dir: 'src' })),
        issues: [],
        score,
        count,
    })

    const makeHistNode = (symbols: string[], score: number, count: number): HistCoalNode => ({
        symbols,
        count,
        score,
    })

    it('retourne [] si aucun noeud ne dépasse les seuils', () => {
        const coal = [makeCoalNode(['a', 'b'], 3, 1)]
        const result = computeSkillCandidates(coal, [], [])
        expect(result).toEqual([])
    })

    it('inclut les noeuds coal avec score >= 6 et count >= 3', () => {
        const coal = [makeCoalNode(['a', 'b'], 6, 3)]
        const result = computeSkillCandidates(coal, [], [])
        expect(result.length).toBe(1)
        expect(result[0].source).toBe('coal')
    })

    it('exclut les noeuds coal avec score < 6', () => {
        const coal = [makeCoalNode(['a', 'b'], 5, 3)]
        const result = computeSkillCandidates(coal, [], [])
        expect(result).toEqual([])
    })

    it('exclut les noeuds coal avec count < 3', () => {
        const coal = [makeCoalNode(['a', 'b'], 7, 2)]
        const result = computeSkillCandidates(coal, [], [])
        expect(result).toEqual([])
    })

    it('inclut les noeuds hist avec score >= 9 et count >= 3', () => {
        const hist = [makeHistNode(['x', 'y'], 9, 3)]
        const result = computeSkillCandidates([], hist, [])
        expect(result.length).toBe(1)
        expect(result[0].source).toBe('hist')
    })

    it('respecte le cap de 12 candidats maximum', () => {
        const coal = Array.from({ length: 20 }, (_, i) =>
            makeCoalNode([`sym${i}`, `sym${i + 100}`], 10, 5)
        )
        const result = computeSkillCandidates(coal, [], [])
        expect(result.length).toBeLessThanOrEqual(12)
    })
})
