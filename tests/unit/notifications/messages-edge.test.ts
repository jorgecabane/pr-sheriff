import { describe, it, expect } from 'vitest'
import {
  formatNewPRMessage,
  formatReminderMessage,
  formatBlameMessage,
} from '../../../src/notifications/slack/messages.js'
import type { PRInfo } from '../../../src/notifications/slack/messages.js'
import type { RepositoryConfig } from '../../../src/config/repository.js'

describe('Message Formatters - Edge Cases', () => {
  const teamMembers = [
    { github: 'alice', slack: 'U1' },
    { github: 'bob', slack: 'U2' },
  ]

  const baseConfig: RepositoryConfig = {
    version: '0.1',
    team: {
      name: 'Test Team',
      members: teamMembers,
    },
    github: {
      auto_assign: {
        enabled: true,
        reviewers_per_pr: 1,
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
      reviewers_per_pr: 1,
      exclude_labels: [],
      include_labels: [],
      timezone: 'UTC',
    },
  }

  describe('formatNewPRMessage - Edge Cases', () => {
    it('debe manejar PR sin reviewers cuando include_reviewers está deshabilitado', () => {
      const config = {
        ...baseConfig,
        notifications: {
          ...baseConfig.notifications,
          new_pr_notifications: {
            ...baseConfig.notifications.new_pr_notifications,
            include_reviewers: false,
          },
        },
      }

      const pr: PRInfo = {
        number: 1,
        title: 'Test PR',
        author: 'alice',
        url: 'https://github.com/owner/repo/pull/1',
        reviewers: ['bob'],
      }

      const message = formatNewPRMessage(pr, config)
      const blocks = message.blocks as unknown[]

      // No debe incluir campo de reviewers
      const reviewersBlock = blocks.find(
        (block: unknown) =>
          typeof block === 'object' &&
          block !== null &&
          'fields' in block &&
          Array.isArray((block as { fields: unknown[] }).fields) &&
          (block as { fields: Array<{ text: string }> }).fields.some(f =>
            f.text.includes('Revisores')
          )
      )

      expect(reviewersBlock).toBeUndefined()
    })

    it('debe manejar PR con reviewers pero sin mapeo a Slack IDs', () => {
      const pr: PRInfo = {
        number: 1,
        title: 'Test PR',
        author: 'alice',
        url: 'https://github.com/owner/repo/pull/1',
        reviewers: ['unknown-user'], // Usuario no en team members
      }

      const message = formatNewPRMessage(pr, baseConfig)
      const blocks = message.blocks as unknown[]

      // Debe incluir el reviewer pero sin mención de Slack
      const reviewersBlock = blocks.find(
        (block: unknown) =>
          typeof block === 'object' &&
          block !== null &&
          'fields' in block &&
          Array.isArray((block as { fields: unknown[] }).fields)
      ) as { fields?: Array<{ text: string }> } | undefined

      const reviewersField = reviewersBlock?.fields?.find(field =>
        field.text.includes('Revisores')
      )

      expect(reviewersField?.text).toContain('@unknown-user')
    })

    it('debe manejar PR sin labels cuando include_labels está deshabilitado', () => {
      const config = {
        ...baseConfig,
        notifications: {
          ...baseConfig.notifications,
          new_pr_notifications: {
            ...baseConfig.notifications.new_pr_notifications,
            include_labels: false,
          },
        },
      }

      const pr: PRInfo = {
        number: 1,
        title: 'Test PR',
        author: 'alice',
        url: 'https://github.com/owner/repo/pull/1',
        labels: ['bug', 'feature'],
      }

      const message = formatNewPRMessage(pr, config)
      const blocks = message.blocks as unknown[]

      // No debe incluir campo de labels
      const labelsBlock = blocks.find(
        (block: unknown) =>
          typeof block === 'object' &&
          block !== null &&
          'fields' in block &&
          Array.isArray((block as { fields: unknown[] }).fields) &&
          (block as { fields: Array<{ text: string }> }).fields.some(f =>
            f.text.includes('Etiquetas')
          )
      )

      expect(labelsBlock).toBeUndefined()
    })
  })

  describe('formatBlameMessage - Edge Cases', () => {
    it('debe manejar PRs sin reviewers', () => {
      const prs: PRInfo[] = [
        {
          number: 1,
          title: 'Old PR',
          author: 'alice',
          url: 'https://github.com/owner/repo/pull/1',
          // Sin reviewers
        },
      ]

      const message = formatBlameMessage(prs, 2, 'C123')
      const blocks = message.blocks as unknown[]

      // Debe crear el mensaje aunque no haya reviewers
      expect(blocks.length).toBeGreaterThan(0)
    })

    it('debe manejar PRs con reviewers pero sin mapeo a Slack IDs', () => {
      const prs: PRInfo[] = [
        {
          number: 1,
          title: 'Old PR',
          author: 'alice',
          url: 'https://github.com/owner/repo/pull/1',
          reviewers: ['unknown-user'],
        },
      ]

      const message = formatBlameMessage(prs, 2, 'C123')
      const blocks = message.blocks as unknown[]

      // Debe incluir el reviewer pero sin mención de Slack
      const reviewerText = JSON.stringify(blocks).includes('unknown-user')
      expect(reviewerText).toBe(true)
    })

    it('debe manejar múltiples PRs con dividers', () => {
      const prs: PRInfo[] = [
        {
          number: 1,
          title: 'PR 1',
          author: 'alice',
          url: 'https://github.com/owner/repo/pull/1',
          reviewers: ['bob'],
        },
        {
          number: 2,
          title: 'PR 2',
          author: 'bob',
          url: 'https://github.com/owner/repo/pull/2',
          reviewers: ['alice'],
        },
        {
          number: 3,
          title: 'PR 3',
          author: 'alice',
          url: 'https://github.com/owner/repo/pull/3',
        },
      ]

      const message = formatBlameMessage(prs, 2, 'C123')
      const blocks = message.blocks as unknown[]

      // Debe tener dividers: 1 inicial + dividers entre PRs
      const dividers = blocks.filter(
        (block: unknown) =>
          typeof block === 'object' &&
          block !== null &&
          'type' in block &&
          block.type === 'divider'
      )

      // Hay 1 divider inicial + 2 dividers entre PRs (entre PR 1-2 y PR 2-3) = 3 total
      // El último PR no tiene divider después
      expect(dividers.length).toBe(3) // 1 inicial + 2 entre PRs
    })
  })

  describe('formatReminderMessage - Edge Cases', () => {
    it('debe manejar lista vacía de PRs', () => {
      const message = formatReminderMessage([], 'U1')

      expect(message.text).toContain('0 PR')
      expect(message.blocks).toBeDefined()
    })

    it('debe manejar un solo PR', () => {
      const prs: PRInfo[] = [
        {
          number: 1,
          title: 'PR 1',
          author: 'alice',
          url: 'https://github.com/owner/repo/pull/1',
        },
      ]

      const message = formatReminderMessage(prs, 'U1')

      expect(message.text).toContain('1 PR')
      expect(message.blocks).toBeDefined()
    })

    it('debe manejar muchos PRs', () => {
      const prs: PRInfo[] = Array.from({ length: 10 }, (_, i) => ({
        number: i + 1,
        title: `PR ${i + 1}`,
        author: 'alice',
        url: `https://github.com/owner/repo/pull/${i + 1}`,
      }))

      const message = formatReminderMessage(prs, 'U1')

      expect(message.text).toContain('10 PR')
      expect(message.blocks).toBeDefined()
      const blocks = message.blocks as unknown[]
      expect(blocks.length).toBeGreaterThan(10) // Debe tener bloques para cada PR
    })
  })
})
