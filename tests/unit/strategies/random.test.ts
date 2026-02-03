import { describe, it, expect } from 'vitest'
import { RandomStrategy } from '../../../src/assignment/strategies/random.js'
import type { TeamMember, PullRequest } from '../../../src/assignment/engine.js'
import type { RepositoryConfig } from '../../../src/config/repository.js'

describe('RandomStrategy', () => {
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
        assignment_strategy: 'random',
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

  it('debe retornar array vacío si no hay miembros', () => {
    const strategy = new RandomStrategy()
    const result = strategy.selectReviewers([], pr, config)
    expect(result).toEqual([])
  })

  it('debe retornar todos los miembros en algún orden', () => {
    const strategy = new RandomStrategy()
    const result = strategy.selectReviewers(members, pr, config)

    expect(result).toHaveLength(3)
    expect(result.map(m => m.github).sort()).toEqual(['alice', 'bob', 'charlie'].sort())
  })

  it('debe retornar orden diferente en cada llamada (probabilístico)', () => {
    const strategy = new RandomStrategy()
    const results: string[][] = []

    // Ejecutar varias veces
    for (let i = 0; i < 10; i++) {
      const result = strategy.selectReviewers(members, { ...pr, number: i }, config)
      results.push(result.map(m => m.github))
    }

    // Al menos una vez debe ser diferente al orden original
    const originalOrder = ['alice', 'bob', 'charlie']
    const hasDifferentOrder = results.some(order => 
      JSON.stringify(order) !== JSON.stringify(originalOrder)
    )

    // Nota: Este test es probabilístico, pero con 10 intentos es muy probable que pase
    expect(hasDifferentOrder).toBe(true)
  })

  it('debe mantener todos los miembros en el resultado', () => {
    const strategy = new RandomStrategy()
    const result = strategy.selectReviewers(members, pr, config)

    const githubUsernames = result.map(m => m.github)
    expect(githubUsernames).toContain('alice')
    expect(githubUsernames).toContain('bob')
    expect(githubUsernames).toContain('charlie')
  })
})
