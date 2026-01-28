import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AssignmentEngine } from '../../../src/assignment/engine.js'
import { RoundRobinStrategy } from '../../../src/assignment/strategies/round-robin.js'
import { LeastBusyStrategy } from '../../../src/assignment/strategies/least-busy.js'
import { RandomStrategy } from '../../../src/assignment/strategies/random.js'
import type { TeamMember, PullRequest } from '../../../src/assignment/engine.js'
import type { RepositoryConfig } from '../../../src/config/repository.js'
import type { GitHubClient } from '../../../src/github/client.js'

// Mock de getAssignmentPersistence
vi.mock('../../../src/assignment/persistence.js', () => ({
  getAssignmentPersistence: vi.fn(() => ({
    getLastAssignedIndex: vi.fn().mockResolvedValue(-1),
    saveLastAssignedReviewer: vi.fn().mockResolvedValue(undefined),
  })),
}))

describe('AssignmentEngine - assignReviewersWithPersistence', () => {
  const members: TeamMember[] = [
    { github: 'alice', slack: 'U1' },
    { github: 'bob', slack: 'U2' },
    { github: 'charlie', slack: 'U3' },
  ]

  const pr: PullRequest = {
    number: 1,
    author: 'alice',
  }

  const config: RepositoryConfig = {
    version: '0.1',
    team: {
      name: 'Test Team',
      members,
    },
    github: {
      auto_assign: {
        enabled: true,
        reviewers_per_pr: 2,
        assignment_strategy: 'round-robin',
        exclude_authors: true,
      },
    },
    notifications: {
      new_pr_notifications: {
        enabled: true,
        channel: 'C123',
        include_reviewers: true,
        include_assignees: true,
        include_description: true,
        include_labels: true,
        include_files_changed: false,
      },
      daily_reminders: {
        enabled: true,
        message_type: 'dm',
      },
      blame: {
        enabled: true,
        channel: 'C123',
        after_days: 2,
      },
    },
    rules: {
      reviewers_per_pr: 2,
      exclude_labels: [],
      include_labels: [],
      timezone: 'UTC',
    },
  }

  let engine: AssignmentEngine

  beforeEach(() => {
    engine = new AssignmentEngine()
    engine.registerStrategy('round-robin', new RoundRobinStrategy())
    engine.registerStrategy('least-busy', new LeastBusyStrategy())
    engine.registerStrategy('random', new RandomStrategy())
  })

  it('debe usar round-robin con persistencia cuando está configurado', async () => {
    const repositoryId = '123/owner/repo'
    const result = await engine.assignReviewersWithPersistence(
      members,
      pr,
      config,
      repositoryId
    )

    expect(result).toHaveLength(2)
    expect(result.every(r => r.github !== 'alice')).toBe(true) // Autor excluido
  })

  it('debe usar least-busy con persistencia cuando está configurado', async () => {
    const configLeastBusy: RepositoryConfig = {
      ...config,
      github: {
        ...config.github,
        auto_assign: {
          ...config.github.auto_assign,
          assignment_strategy: 'least-busy',
        },
      },
    }

    const mockGitHubClient = {
      listAllOpenPullRequests: vi.fn().mockResolvedValue([]),
    } as unknown as GitHubClient

    const repositoryId = '123/owner/repo'
    const result = await engine.assignReviewersWithPersistence(
      members,
      pr,
      configLeastBusy,
      repositoryId,
      mockGitHubClient,
      '123',
      'owner',
      'repo'
    )

    expect(result).toHaveLength(2)
    expect(mockGitHubClient.listAllOpenPullRequests).toHaveBeenCalled()
  })

  it('debe hacer fallback a round-robin si la estrategia no existe', async () => {
    const configUnknown: RepositoryConfig = {
      ...config,
      github: {
        ...config.github,
        auto_assign: {
          ...config.github.auto_assign,
          assignment_strategy: 'unknown-strategy',
        },
      },
    }

    const repositoryId = '123/owner/repo'
    const result = await engine.assignReviewersWithPersistence(
      members,
      pr,
      configUnknown,
      repositoryId
    )

    // Cuando hace fallback, debe aplicar reviewers_per_pr
    expect(result).toHaveLength(2) // reviewers_per_pr = 2
    expect(result.every(r => r.github !== 'alice')).toBe(true) // Autor excluido
  })

  it('debe usar versión síncrona para estrategias que no soportan async', async () => {
    const configRandom: RepositoryConfig = {
      ...config,
      github: {
        ...config.github,
        auto_assign: {
          ...config.github.auto_assign,
          assignment_strategy: 'random',
        },
      },
    }

    const repositoryId = '123/owner/repo'
    const result = await engine.assignReviewersWithPersistence(
      members,
      pr,
      configRandom,
      repositoryId
    )

    expect(result).toHaveLength(2)
  })

  it('debe lanzar error si no hay estrategias disponibles', async () => {
    const emptyEngine = new AssignmentEngine()
    const repositoryId = '123/owner/repo'

    await expect(
      emptyEngine.assignReviewersWithPersistence(
        members,
        pr,
        {
          ...config,
          github: {
            ...config.github,
            auto_assign: {
              ...config.github.auto_assign,
              assignment_strategy: 'unknown',
            },
          },
        },
        repositoryId
      )
    ).rejects.toThrow('No assignment strategy available')
  })

  it('debe filtrar al autor si exclude_authors está habilitado', async () => {
    const repositoryId = '123/owner/repo'
    const result = await engine.assignReviewersWithPersistence(
      members,
      pr,
      config,
      repositoryId
    )

    expect(result.every(r => r.github !== 'alice')).toBe(true)
  })

  it('debe retornar array vacío si no hay miembros disponibles después de filtrar', async () => {
    const onlyAlice: TeamMember[] = [{ github: 'alice', slack: 'U1' }]
    const prByAlice: PullRequest = {
      number: 1,
      author: 'alice',
    }

    const configExcludeAuthor = {
      ...config,
      github: {
        ...config.github,
        auto_assign: {
          ...config.github.auto_assign,
          exclude_authors: true,
        },
      },
    }

    const repositoryId = '123/owner/repo'
    const result = await engine.assignReviewersWithPersistence(
      onlyAlice,
      prByAlice,
      configExcludeAuthor,
      repositoryId
    )

    expect(result).toEqual([])
  })
})
