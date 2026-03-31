import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    taskToFilter, btnVariant, buildCentralInputPayload, isTaskRowSelector,
    formatDiffSummary, groupTasksByPlan, detectJustFinished, buildMarkImplementedPayload,
    getInitialConsoleTab, findTaskDag, filterIssuesForSearch
} from './TaskList.helpers'
import type { Task, PlanGroup } from './TaskList.helpers'

function makeTask(overrides: Partial<Task> = {}): Task {
    return {
        id: 'test-id',
        title: 'Test task',
        status: 'specification',
        logs: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        ...overrides,
    }
}

describe('taskToFilter', () => {
    it('retourne "specification" pour une task en specification', () => {
        const task = makeTask({ status: 'specification' })
        expect(taskToFilter(task)).toBe('specification')
    })

    it('retourne "specification" pour une task en planification sans plan', () => {
        const task = makeTask({ status: 'planification', hasPlan: false })
        expect(taskToFilter(task)).toBe('specification')
    })

    it('retourne "implementation" pour une task en planification avec plan', () => {
        const task = makeTask({ status: 'planification', hasPlan: true })
        expect(taskToFilter(task)).toBe('implementation')
    })

    it('retourne "implementation" pour une task en implementation', () => {
        const task = makeTask({ status: 'implementation' })
        expect(taskToFilter(task)).toBe('implementation')
    })

    it('retourne "validation" pour une task en documentation', () => {
        const task = makeTask({ status: 'documentation' })
        expect(taskToFilter(task)).toBe('validation')
    })

    it('retourne "validation" pour une task en validation', () => {
        const task = makeTask({ status: 'validation' })
        expect(taskToFilter(task)).toBe('validation')
    })

    it('retourne "merged" pour une task mergee', () => {
        const task = makeTask({ status: 'merged' })
        expect(taskToFilter(task)).toBe('merged')
    })

    it('retourne null pour une task failed', () => {
        const task = makeTask({ status: 'failed' })
        expect(taskToFilter(task)).toBe(null)
    })
})

describe('btnVariant', () => {
    it('retourne "active" pour le step courant', () => {
        expect(btnVariant(2, 2)).toBe('active')
    })

    it('retourne "secondary" pour les steps precedents', () => {
        expect(btnVariant(0, 2)).toBe('secondary')
        expect(btnVariant(1, 2)).toBe('secondary')
    })

    it('retourne "disabled" pour les steps suivants', () => {
        expect(btnVariant(3, 2)).toBe('disabled')
        expect(btnVariant(4, 2)).toBe('disabled')
    })
})

describe('issue #262 - ATLAS supprime de TaskList.helpers', () => {
    it('TaskList.helpers n\'exporte pas toggleAtlas', async () => {
        const mod = await import('./TaskList.helpers')
        expect((mod as any).toggleAtlas).toBeUndefined()
    })

    it('TaskList.helpers n\'exporte pas generateAtlas', async () => {
        const mod = await import('./TaskList.helpers')
        expect((mod as any).generateAtlas).toBeUndefined()
    })

    it('TaskList.helpers n\'exporte pas atlasGenerating', async () => {
        const mod = await import('./TaskList.helpers')
        expect((mod as any).atlasGenerating).toBeUndefined()
    })
})

describe('issue #41 - buildCentralInputPayload', () => {
    it('construit le payload avec le texte et le taskId', () => {
        const result = buildCentralInputPayload('hello world', 'task-123')
        expect(result).toEqual({ input: 'hello world', taskId: 'task-123' })
    })

    it('retourne null si le texte est vide', () => {
        const result = buildCentralInputPayload('   ', 'task-123')
        expect(result).toBeNull()
    })

    it('retourne null si pas de taskId', () => {
        const result = buildCentralInputPayload('hello', '')
        expect(result).toBeNull()
    })

    it('trim le texte', () => {
        const result = buildCentralInputPayload('  hello  ', 'task-123')
        expect(result).toEqual({ input: 'hello', taskId: 'task-123' })
    })
})

describe('issue #178 - isTaskRowSelector', () => {
    it('retourne le selecteur correct pour un taskId', () => {
        const selector = isTaskRowSelector('abc-123')
        expect(selector).toBe('[data-task-id="abc-123"]')
    })

    it('echappe les caracteres speciaux dans le taskId', () => {
        const selector = isTaskRowSelector('ed5954e8-c23f-4a89-afa7-1670d193344c')
        expect(selector).toBe('[data-task-id="ed5954e8-c23f-4a89-afa7-1670d193344c"]')
    })
})

describe('issue #185 - formatDiffSummary', () => {
    it('retourne un résumé avec le nombre de fichiers modifiés', () => {
        const diff = `diff --git a/file1.ts b/file1.ts
index abc..def 100644
--- a/file1.ts
+++ b/file1.ts
@@ -1,3 +1,4 @@
 line
+new line
diff --git a/file2.ts b/file2.ts
index 123..456 100644
--- a/file2.ts
+++ b/file2.ts
@@ -1 +1 @@
-old
+new`
        const summary = formatDiffSummary(diff)
        expect(summary.fileCount).toBe(2)
    })

    it('retourne 0 fichiers pour un diff vide', () => {
        const summary = formatDiffSummary('')
        expect(summary.fileCount).toBe(0)
    })

    it('retourne 1 fichier pour un diff avec un seul fichier', () => {
        const diff = `diff --git a/file.ts b/file.ts
index abc..def 100644
--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new`
        const summary = formatDiffSummary(diff)
        expect(summary.fileCount).toBe(1)
    })

    it('retourne la liste des fichiers modifiés', () => {
        const diff = `diff --git a/src/foo.ts b/src/foo.ts
index abc..def 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1 +1 @@
-x
+y`
        const summary = formatDiffSummary(diff)
        expect(summary.files).toContain('src/foo.ts')
    })
})

describe('issue #36 - groupTasksByPlan', () => {
    const tasks: Task[] = [
        makeTask({ id: 't1', issueNumber: 10, title: 'Task 1' }),
        makeTask({ id: 't2', issueNumber: 20, title: 'Task 2' }),
        makeTask({ id: 't3', issueNumber: 30, title: 'Task 3' }),
        makeTask({ id: 't4', title: 'Task sans issue' }),
    ]

    const planGroups: PlanGroup[] = [
        { index: 0, name: 'Groupe A', issues: [10, 20], summary: '', dependsOn: [] },
        { index: 1, name: 'Groupe B', issues: [30], summary: '', dependsOn: [] },
    ]

    it('groupe les tasks par plan group', () => {
        const result = groupTasksByPlan(tasks, planGroups)
        const groupA = result.find(g => g.name === 'Groupe A')
        expect(groupA).toBeDefined()
        expect(groupA?.tasks.map(t => t.issueNumber)).toContain(10)
        expect(groupA?.tasks.map(t => t.issueNumber)).toContain(20)
    })

    it('met les tasks sans groupe dans "Sans groupe"', () => {
        const result = groupTasksByPlan(tasks, planGroups)
        const sans = result.find(g => g.name === 'Sans groupe')
        expect(sans).toBeDefined()
        expect(sans?.tasks.find(t => t.id === 't4')).toBeDefined()
    })

    it('retourne un seul groupe "Sans groupe" si pas de planGroups', () => {
        const result = groupTasksByPlan(tasks, [])
        expect(result.length).toBe(1)
        expect(result[0].name).toBe('Sans groupe')
        expect(result[0].tasks.length).toBe(tasks.length)
    })

    it('respecte l\'ordre des groupes', () => {
        const result = groupTasksByPlan(tasks, planGroups)
        expect(result[0].name).toBe('Groupe A')
        expect(result[1].name).toBe('Groupe B')
    })
})

describe('issue #132 - detectJustFinished', () => {
    it('retourne true quand le run vient de se terminer sur la task sélectionnée', () => {
        const result = detectJustFinished({
            wasRunning: true,
            isRunning: false,
            runningTaskId: 'task-1',
            selectedTaskId: 'task-1',
        })
        expect(result).toBe(true)
    })

    it('retourne false si la task est différente', () => {
        const result = detectJustFinished({
            wasRunning: true,
            isRunning: false,
            runningTaskId: 'task-2',
            selectedTaskId: 'task-1',
        })
        expect(result).toBe(false)
    })

    it('retourne false si le run est encore actif', () => {
        const result = detectJustFinished({
            wasRunning: true,
            isRunning: true,
            runningTaskId: 'task-1',
            selectedTaskId: 'task-1',
        })
        expect(result).toBe(false)
    })

    it('retourne false si wasRunning est false', () => {
        const result = detectJustFinished({
            wasRunning: false,
            isRunning: false,
            runningTaskId: 'task-1',
            selectedTaskId: 'task-1',
        })
        expect(result).toBe(false)
    })
})

describe('issue #18 - buildMarkImplementedPayload', () => {
    it('retourne le bon payload pour marquer une task comme implémentée', () => {
        const task = makeTask({ id: 'task-5', status: 'implementation' })
        const result = buildMarkImplementedPayload(task)
        expect(result).toEqual({ status: 'documentation' })
    })

    it('retourne null si la task n\'est pas en implementation', () => {
        const task = makeTask({ id: 'task-5', status: 'specification' })
        const result = buildMarkImplementedPayload(task)
        expect(result).toBeNull()
    })

    it('retourne null si la task est merged', () => {
        const task = makeTask({ id: 'task-5', status: 'merged' })
        const result = buildMarkImplementedPayload(task)
        expect(result).toBeNull()
    })
})

describe('issue #154 - getInitialConsoleTab', () => {
    it('retourne "plan" pour une nouvelle task sans plan', () => {
        const task = makeTask({ status: 'specification', hasPlan: false })
        const tab = getInitialConsoleTab(task)
        expect(tab).toBe('plan')
    })

    it('retourne "symbols" pour une task avec plan existant', () => {
        const task = makeTask({ status: 'implementation', hasPlan: true })
        const tab = getInitialConsoleTab(task)
        expect(tab).toBe('symbols')
    })

    it('retourne "plan" pour une task en planification', () => {
        const task = makeTask({ status: 'planification', hasPlan: false })
        const tab = getInitialConsoleTab(task)
        expect(tab).toBe('plan')
    })

    it('retourne "symbols" pour une task en implementation avec plan', () => {
        const task = makeTask({ status: 'implementation', hasPlan: true })
        const tab = getInitialConsoleTab(task)
        expect(tab).toBe('symbols')
    })
})

// RED pour issue #246 - trouver le DAG d'une task
describe('issue #246 - findTaskDag', () => {
    const dagsByKeyword = {
        'task': { steps: [{ id: 10, label: '#10', issues: [10] }], spine: [], stats: { nodes: 1, edges: 0, levels: 1, steps: 1 } },
        'auth': { steps: [{ id: 20, label: '#20', issues: [20] }], spine: [], stats: { nodes: 1, edges: 0, levels: 1, steps: 1 } },
    }

    it('retourne le DAG correspondant au keyword de la task', () => {
        const task = makeTask({ id: 't1', issueNumber: 10 })
        const result = findTaskDag(task, dagsByKeyword)
        expect(result).toBeDefined()
        expect(result?.steps[0].issues).toContain(10)
    })

    it('retourne null si aucun DAG ne contient l\'issueNumber', () => {
        const task = makeTask({ id: 't1', issueNumber: 99 })
        const result = findTaskDag(task, dagsByKeyword)
        expect(result).toBeNull()
    })

    it('retourne null si la task n\'a pas d\'issueNumber', () => {
        const task = makeTask({ id: 't1' })
        const result = findTaskDag(task, dagsByKeyword)
        expect(result).toBeNull()
    })
})

// RED pour issue #40 - filtrage des issues pour la recherche cross-type
describe('issue #40 - filterIssuesForSearch', () => {
    const issues = [
        { number: 1, title: 'Add authentication feature', keyword: 'auth' },
        { number: 2, title: 'Fix login bug', keyword: 'auth' },
        { number: 3, title: 'Update dashboard UI', keyword: 'ui' },
    ]

    it('retourne les issues correspondant à la query', () => {
        const result = filterIssuesForSearch(issues, 'auth')
        expect(result.length).toBeGreaterThan(0)
        expect(result[0].number).toBe(1)
    })

    it('retourne une liste vide si query vide', () => {
        const result = filterIssuesForSearch(issues, '')
        expect(result).toHaveLength(0)
    })

    it('retourne une liste vide si query trop courte', () => {
        const result = filterIssuesForSearch(issues, 'a')
        expect(result).toHaveLength(0)
    })

    it('recherche dans le titre', () => {
        const result = filterIssuesForSearch(issues, 'login')
        expect(result.some(i => i.number === 2)).toBe(true)
    })
})
