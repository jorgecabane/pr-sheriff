import { describe, it, expect } from 'vitest'
import { AssignmentEngine } from '../../../src/assignment/engine.js'
import { RoundRobinStrategy } from '../../../src/assignment/strategies/round-robin.js'
import { RandomStrategy } from '../../../src/assignment/strategies/random.js'
import type { TeamMember, PullRequest } from '../../../src/assignment/engine.js'
import type { RepositoryConfig } from '../../../src/config/repository.js'

describe('AssignmentEngine', () => {
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

  it('debe registrar estrategias correctamente', () => {
    const engine = new AssignmentEngine()
    engine.registerStrategy('round-robin', new RoundRobinStrategy())
    engine.registerStrategy('random', new RandomStrategy())

    const result = engine.assignReviewers(members, pr, config)
    expect(result.length).toBeGreaterThan(0)
  })

  it('debe filtrar al autor si exclude_authors está habilitado', () => {
    const engine = new AssignmentEngine()
    engine.registerStrategy('round-robin', new RoundRobinStrategy())

    const result = engine.assignReviewers(members, pr, config)

    // alice es el autor, no debe estar en los resultados
    expect(result.every(r => r.github !== 'alice')).toBe(true)
  })

  it('debe respetar reviewers_per_pr', () => {
    const engine = new AssignmentEngine()
    engine.registerStrategy('round-robin', new RoundRobinStrategy())

    const result = engine.assignReviewers(members, pr, config)

    expect(result.length).toBe(2) // reviewers_per_pr = 2
  })

  it('debe hacer fallback a round-robin si la estrategia no existe', () => {
    const engine = new AssignmentEngine()
    engine.registerStrategy('round-robin', new RoundRobinStrategy())

    const configWithUnknownStrategy = {
      ...config,
      github: {
        ...config.github,
        auto_assign: {
          ...config.github.auto_assign,
          assignment_strategy: 'unknown-strategy',
        },
      },
    }

    const result = engine.assignReviewers(members, pr, configWithUnknownStrategy)
    expect(result.length).toBeGreaterThan(0)
  })

  it('debe retornar array vacío si no hay miembros disponibles', () => {
    const engine = new AssignmentEngine()
    engine.registerStrategy('round-robin', new RoundRobinStrategy())

    // Si todos los miembros son el autor
    const prByAlice: PullRequest = {
      number: 1,
      author: 'alice',
    }
    const onlyAlice: TeamMember[] = [{ github: 'alice', slack: 'U1' }]

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

    const result = engine.assignReviewers(onlyAlice, prByAlice, configExcludeAuthor)
    expect(result).toEqual([])
  })
})
