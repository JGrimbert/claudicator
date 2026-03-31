import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks des services serveur
vi.mock('$lib/server/services/tasks', () => ({
    resolveTaskContext: vi.fn(),
    updateTask: vi.fn(),
}))
vi.mock('$lib/server/services/github', () => ({
    findOpenPullRequest: vi.fn(),
    createPullRequest: vi.fn(),
    mergePullRequest: vi.fn(),
}))
vi.mock('$lib/server/services/git', () => ({
    getMainBranch: vi.fn(),
    checkoutMain: vi.fn(),
}))
vi.mock('$lib/server/services/projects', () => ({
    getCurrentProject: vi.fn(),
}))
vi.mock('$lib/server/services/processes', () => ({
    killProcess: vi.fn(),
    isRunning: vi.fn(),
}))

import { POST } from './+server'
import { resolveTaskContext, updateTask } from '$lib/server/services/tasks'
import { findOpenPullRequest, createPullRequest, mergePullRequest } from '$lib/server/services/github'
import { getMainBranch, checkoutMain } from '$lib/server/services/git'
import { getCurrentProject } from '$lib/server/services/projects'
import { killProcess, isRunning } from '$lib/server/services/processes'

const mockResolveTaskContext = resolveTaskContext as ReturnType<typeof vi.fn>
const mockUpdateTask = updateTask as ReturnType<typeof vi.fn>
const mockFindOpenPullRequest = findOpenPullRequest as ReturnType<typeof vi.fn>
const mockCreatePullRequest = createPullRequest as ReturnType<typeof vi.fn>
const mockMergePullRequest = mergePullRequest as ReturnType<typeof vi.fn>
const mockGetMainBranch = getMainBranch as ReturnType<typeof vi.fn>
const mockCheckoutMain = checkoutMain as ReturnType<typeof vi.fn>
const mockGetCurrentProject = getCurrentProject as ReturnType<typeof vi.fn>
const mockKillProcess = killProcess as ReturnType<typeof vi.fn>
const mockIsRunning = isRunning as ReturnType<typeof vi.fn>

const baseTask = {
    id: 'task-123',
    title: 'Test task',
    branch: 'issue-1-test',
    issueNumber: 1,
    status: 'implementation' as const,
    logs: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
}

function makeParams(id: string) {
    return { id }
}

describe('POST /api/tasks/[id]/merge', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetCurrentProject.mockReturnValue({ owner: 'testowner', repo: 'testrepo' })
        mockGetMainBranch.mockResolvedValue('main')
        mockFindOpenPullRequest.mockResolvedValue({ number: 42 })
        mockMergePullRequest.mockResolvedValue(undefined)
        mockCheckoutMain.mockResolvedValue(undefined)
        mockUpdateTask.mockReturnValue({ ...baseTask, status: 'merged' })
        mockIsRunning.mockReturnValue(false)
    })

    it('retourne 404 si la task est introuvable', async () => {
        mockResolveTaskContext.mockReturnValue(null)
        const res = await POST({ params: makeParams('unknown') } as any)
        expect(res.status).toBe(404)
    })

    it('retourne 400 si la task n\'a pas de branche', async () => {
        mockResolveTaskContext.mockReturnValue({
            task: { ...baseTask, branch: undefined },
            projectRoot: '/test',
        })
        const res = await POST({ params: makeParams('task-123') } as any)
        expect(res.status).toBe(400)
    })

    it('merge la PR et met à jour le statut à "merged"', async () => {
        mockResolveTaskContext.mockReturnValue({ task: baseTask, projectRoot: '/test' })
        const res = await POST({ params: makeParams('task-123') } as any)
        const data = await res.json()
        expect(data.status).toBe('merged')
        expect(mockMergePullRequest).toHaveBeenCalledOnce()
    })

    // RED pour issue #91 : killProcess doit être appelé si un process est actif
    it('issue #91 : appelle killProcess si un processus est actif sur la task', async () => {
        mockResolveTaskContext.mockReturnValue({ task: baseTask, projectRoot: '/test' })
        mockIsRunning.mockReturnValue(true)
        await POST({ params: makeParams('task-123') } as any)
        expect(mockKillProcess).toHaveBeenCalledWith('task-123')
    })

    it('issue #91 : ne pas appeler killProcess si aucun processus actif', async () => {
        mockResolveTaskContext.mockReturnValue({ task: baseTask, projectRoot: '/test' })
        mockIsRunning.mockReturnValue(false)
        await POST({ params: makeParams('task-123') } as any)
        expect(mockKillProcess).not.toHaveBeenCalled()
    })
})
