import { describe, it, expect } from 'vitest'
import { AssignmentEngine } from '../../../src/assignment/engine.js'
import { RoundRobinStrategy } from '../../../src/assignment/strategies/round-robin.js'
import type { TeamMember, PullRequest } from '../../../src/assignment/engine.js'
import type { RepositoryConfig } from '../../../src/config/repository.js'

describe('AssignmentEngine - Error Cases', () => {
  const members: TeamMember[] = [
    { github: 'alice', slack: 'U1' },
    { github: 'bob', slack: 'U2' },
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
        assignment_strategy: 'unknown-strategy',
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
      reviewers_per_pr: 1,
      exclude_labels: [],
      include_labels: [],
      timezone: 'UTC',
    },
  }

  it('debe lanzar error si no hay estrategias disponibles en assignReviewers', () => {
    const emptyEngine = new AssignmentEngine()

    expect(() => {
      emptyEngine.assignReviewers(members, pr, {
        ...config,
        github: {
          ...config.github,
          auto_assign: {
            ...config.github.auto_assign,
            assignment_strategy: 'unknown',
          },
        },
      })
    }).toThrow('No assignment strategy available')
  })

  it('debe lanzar error si no hay estrategias disponibles en assignReviewersWithPersistence', async () => {
    const emptyEngine = new AssignmentEngine()

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
        '123/owner/repo'
      )
    ).rejects.toThrow('No assignment strategy available')
  })

  it('debe hacer fallback a round-robin si la estrategia no existe y round-robin está disponible', () => {
    const engine = new AssignmentEngine()
    engine.registerStrategy('round-robin', new RoundRobinStrategy())

    const result = engine.assignReviewers(members, pr, {
      ...config,
      github: {
        ...config.github,
        auto_assign: {
          ...config.github.auto_assign,
          assignment_strategy: 'unknown-strategy',
        },
      },
    })

    // Debe usar round-robin como fallback
    expect(result.length).toBeGreaterThan(0)
  })
})
