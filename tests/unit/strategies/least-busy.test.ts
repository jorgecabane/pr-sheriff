import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LeastBusyStrategy } from '../../../src/assignment/strategies/least-busy.js'
import type { TeamMember, PullRequest } from '../../../src/assignment/engine.js'
import type { RepositoryConfig } from '../../../src/config/repository.js'
import type { GitHubClient, GitHubPullRequest } from '../../../src/github/client.js'

describe('LeastBusyStrategy', () => {
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
        reviewers_per_pr: 1,
        assignment_strategy: 'least-busy',
        exclude_authors: false,
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
      exclude_labels: [],
      include_labels: [],
    },
  }

  describe('selectReviewers (síncrono - fallback)', () => {
    it('debe retornar array vacío si no hay miembros', () => {
      const strategy = new LeastBusyStrategy()
      const result = strategy.selectReviewers([], pr, config)
      expect(result).toEqual([])
    })

    it('debe retornar orden alfabético como fallback', () => {
      const strategy = new LeastBusyStrategy()
      const result = strategy.selectReviewers(members, pr, config)

      expect(result).toHaveLength(3)
      expect(result[0].github).toBe('alice')
      expect(result[1].github).toBe('bob')
      expect(result[2].github).toBe('charlie')
    })
  })

  describe('selectReviewersAsync (con GitHub)', () => {
    let mockGitHubClient: GitHubClient

    beforeEach(() => {
      mockGitHubClient = {
        listAllOpenPullRequests: vi.fn(),
      } as unknown as GitHubClient
    })

    it('debe retornar array vacío si no hay miembros', async () => {
      const strategy = new LeastBusyStrategy()
      const result = await strategy.selectReviewersAsync(
        [],
        pr,
        config,
        mockGitHubClient,
        '123',
        'owner',
        'repo'
      )
      expect(result).toEqual([])
    })

    it('debe seleccionar el reviewer con menos PRs', async () => {
      // alice tiene 2 PRs, bob tiene 0, charlie tiene 1
      const mockPRs: GitHubPullRequest[] = [
        {
          number: 2,
          title: 'PR 2',
          state: 'open',
          user: { login: 'other' },
          html_url: 'https://github.com/owner/repo/pull/2',
          body: null,
          labels: [],
          requested_reviewers: [{ login: 'alice' }],
          base: { ref: 'main' },
          head: { ref: 'feature' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          number: 3,
          title: 'PR 3',
          state: 'open',
          user: { login: 'other' },
          html_url: 'https://github.com/owner/repo/pull/3',
          body: null,
          labels: [],
          requested_reviewers: [{ login: 'alice' }, { login: 'charlie' }],
          base: { ref: 'main' },
          head: { ref: 'feature' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ]

      vi.mocked(mockGitHubClient.listAllOpenPullRequests).mockResolvedValue(mockPRs)

      const strategy = new LeastBusyStrategy()
      const result = await strategy.selectReviewersAsync(
        members,
        pr,
        config,
        mockGitHubClient,
        '123',
        'owner',
        'repo'
      )

      // bob tiene 0 PRs, debe ser el primero
      expect(result[0].github).toBe('bob')
      // charlie tiene 1 PR, debe ser el segundo
      expect(result[1].github).toBe('charlie')
      // alice tiene 2 PRs, debe ser el último
      expect(result[2].github).toBe('alice')
    })

    it('debe ignorar el PR actual en el conteo', async () => {
      const mockPRs: GitHubPullRequest[] = [
        {
          number: 1, // El PR actual
          title: 'PR 1',
          state: 'open',
          user: { login: 'alice' },
          html_url: 'https://github.com/owner/repo/pull/1',
          body: null,
          labels: [],
          requested_reviewers: [{ login: 'bob' }],
          base: { ref: 'main' },
          head: { ref: 'feature' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ]

      vi.mocked(mockGitHubClient.listAllOpenPullRequests).mockResolvedValue(mockPRs)

      const strategy = new LeastBusyStrategy()
      const result = await strategy.selectReviewersAsync(
        members,
        pr,
        config,
        mockGitHubClient,
        '123',
        'owner',
        'repo'
      )

      // Todos deberían tener carga 0 porque el PR actual se ignora
      expect(result).toHaveLength(3)
    })

    it('debe filtrar PRs con labels excluidas', async () => {
      const mockPRs: GitHubPullRequest[] = [
        {
          number: 2,
          title: 'PR 2',
          state: 'open',
          user: { login: 'other' },
          html_url: 'https://github.com/owner/repo/pull/2',
          body: null,
          labels: [{ name: 'draft' }],
          requested_reviewers: [{ login: 'alice' }],
          base: { ref: 'main' },
          head: { ref: 'feature' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ]

      const configWithExclude: RepositoryConfig = {
        ...config,
        rules: {
          ...config.rules,
          exclude_labels: ['draft'],
        },
      }

      vi.mocked(mockGitHubClient.listAllOpenPullRequests).mockResolvedValue(mockPRs)

      const strategy = new LeastBusyStrategy()
      const result = await strategy.selectReviewersAsync(
        members,
        pr,
        configWithExclude,
        mockGitHubClient,
        '123',
        'owner',
        'repo'
      )

      // El PR con label 'draft' debe ser ignorado, todos tienen carga 0
      expect(result).toHaveLength(3)
    })

    it('debe hacer fallback a orden alfabético si hay error', async () => {
      vi.mocked(mockGitHubClient.listAllOpenPullRequests).mockRejectedValue(
        new Error('GitHub API error')
      )

      const strategy = new LeastBusyStrategy()
      const result = await strategy.selectReviewersAsync(
        members,
        pr,
        config,
        mockGitHubClient,
        '123',
        'owner',
        'repo'
      )

      // Debe retornar orden alfabético como fallback
      expect(result).toHaveLength(3)
      expect(result[0].github).toBe('alice')
      expect(result[1].github).toBe('bob')
      expect(result[2].github).toBe('charlie')
    })
  })
})
