import { describe, it, expect } from 'vitest'
import { parseGroups, extractMermaid, textWithoutMermaid } from './IssueAnalysis.helpers'

const SAMPLE_ANALYSIS = `
## Analyse

### Groupe 1 — Infrastructure
Issues : #10, #11, #12
Dépend de : aucun
Résumé : Socle technique de base

### Groupe 2 — UI
Issues : #20, #21
Dépend de : Infrastructure
Résumé : Interface utilisateur principale

\`\`\`mermaid
graph TD
  G1[Infrastructure] --> G2[UI]
\`\`\`
`

describe('parseGroups', () => {
    it('retourne un tableau vide pour une chaîne sans groupes', () => {
        expect(parseGroups("")).toEqual([])
        expect(parseGroups("aucun groupe ici")).toEqual([])
    })

    it("parse correctement les numéros d'issues", () => {
        const groups = parseGroups(SAMPLE_ANALYSIS)
        expect(groups[0].issues).toEqual([10, 11, 12])
        expect(groups[1].issues).toEqual([20, 21])
    })

    it('parse correctement les noms de groupes', () => {
        const groups = parseGroups(SAMPLE_ANALYSIS)
        expect(groups[0].name).toBe("Infrastructure")
        expect(groups[1].name).toBe("UI")
    })

    it('parse les dépendances', () => {
        const groups = parseGroups(SAMPLE_ANALYSIS)
        expect(groups[1].dependsOn).toContain("Infrastructure")
    })

    it('parse le résumé', () => {
        const groups = parseGroups(SAMPLE_ANALYSIS)
        expect(groups[0].summary).toBe("Socle technique de base")
    })

    it('ignore les blocs sans issues', () => {
        const text = `### Groupe 1 — Vide\nDépend de : aucun\nRésumé : rien\n`
        expect(parseGroups(text)).toEqual([])
    })
})

describe('extractMermaid', () => {
    it('retourne null si aucun bloc mermaid', () => {
        expect(extractMermaid("pas de mermaid")).toBeNull()
        expect(extractMermaid("")).toBeNull()
    })

    it('extrait le contenu du bloc mermaid', () => {
        const result = extractMermaid(SAMPLE_ANALYSIS)
        expect(result).toContain("graph TD")
        expect(result).toContain("Infrastructure")
    })

    it('ne retourne pas les balises backtick', () => {
        const result = extractMermaid(SAMPLE_ANALYSIS)
        expect(result).not.toContain("```")
    })
})

describe('textWithoutMermaid', () => {
    it('retire le bloc mermaid du texte', () => {
        const result = textWithoutMermaid(SAMPLE_ANALYSIS)
        expect(result).not.toContain("```mermaid")
        expect(result).not.toContain("graph TD")
    })

    it('retire les sections Groupe du texte', () => {
        const result = textWithoutMermaid(SAMPLE_ANALYSIS)
        expect(result).not.toContain("### Groupe")
    })

    it('retourne un message par défaut si le texte nettoyé est vide', () => {
        const text = `\`\`\`mermaid\ngraph TD\n  A --> B\n\`\`\`\n### Groupe 1 — Infra\nIssues : #1\n`
        const result = textWithoutMermaid(text)
        expect(result).toContain("Aucun contenu textuel")
    })
})
