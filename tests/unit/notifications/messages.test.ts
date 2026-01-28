import { describe, it, expect } from 'vitest'
import {
  formatNewPRMessage,
  formatReminderMessage,
  formatBlameMessage,
} from '../../../src/notifications/slack/messages.js'
import type { PRInfo } from '../../../src/notifications/slack/messages.js'
import type { RepositoryConfig } from '../../../src/config/repository.js'

describe('Message Formatters', () => {
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

  describe('formatNewPRMessage', () => {
    it('debe incluir información básica del PR', () => {
      const pr: PRInfo = {
        number: 1,
        title: 'Test PR',
        author: 'alice',
        url: 'https://github.com/owner/repo/pull/1',
        reviewers: ['bob'],
        reviewerSlackIds: ['U2'],
      }

      const message = formatNewPRMessage(pr, baseConfig)

      expect(message.channel).toBe('C123')
      expect(message.text).toContain('Test PR')
      expect(message.text).toContain('#1')
      expect(message.blocks).toBeDefined()
    })

    it('debe incluir menciones de Slack para reviewers', () => {
      const pr: PRInfo = {
        number: 1,
        title: 'Test PR',
        author: 'alice',
        url: 'https://github.com/owner/repo/pull/1',
        reviewers: ['bob'],
        reviewerSlackIds: ['U2'],
      }

      const message = formatNewPRMessage(pr, baseConfig)
      const blocks = message.blocks as unknown[]

      // Buscar el bloque que contiene los reviewers
      const reviewersBlock = blocks.find(
        (block: unknown) =>
          typeof block === 'object' &&
          block !== null &&
          'type' in block &&
          block.type === 'section' &&
          'fields' in block
      ) as { fields?: Array<{ text: string }> } | undefined

      expect(reviewersBlock?.fields).toBeDefined()
      const reviewersField = reviewersBlock?.fields?.find(field =>
        field.text.includes('Revisores')
      )
      expect(reviewersField?.text).toContain('<@U2>')
    })

    it('no debe incluir labels si no hay', () => {
      const pr: PRInfo = {
        number: 1,
        title: 'Test PR',
        author: 'alice',
        url: 'https://github.com/owner/repo/pull/1',
      }

      const message = formatNewPRMessage(pr, baseConfig)
      const blocks = message.blocks as unknown[]
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

    it('debe truncar descripción si es muy larga', () => {
      const longDescription = 'a'.repeat(500)
      const pr: PRInfo = {
        number: 1,
        title: 'Test PR',
        author: 'alice',
        url: 'https://github.com/owner/repo/pull/1',
        description: longDescription,
      }

      const message = formatNewPRMessage(pr, baseConfig)
      const blocks = message.blocks as unknown[]
      const descriptionBlock = blocks.find(
        (block: unknown) =>
          typeof block === 'object' &&
          block !== null &&
          'type' in block &&
          block.type === 'section' &&
          'text' in block
      ) as { text?: { text: string } } | undefined

      expect(descriptionBlock?.text?.text.length).toBeLessThanOrEqual(305) // 300 + "..." + "_" al inicio y final
    })
  })

  describe('formatReminderMessage', () => {
    it('debe formatear mensaje con PRs pendientes', () => {
      const prs: PRInfo[] = [
        {
          number: 1,
          title: 'PR 1',
          author: 'alice',
          url: 'https://github.com/owner/repo/pull/1',
          labels: ['bug'],
        },
        {
          number: 2,
          title: 'PR 2',
          author: 'bob',
          url: 'https://github.com/owner/repo/pull/2',
        },
      ]

      // formatReminderMessage recibe reviewerSlackId directamente, no GitHub username
      const message = formatReminderMessage(prs, 'U2') // Slack ID de bob

      expect(message.user).toBe('U2') // Slack ID de bob
      expect(message.text).toContain('2 PR')
      expect(message.blocks).toBeDefined()
    })

    it('debe incluir botón para cada PR', () => {
      const prs: PRInfo[] = [
        {
          number: 1,
          title: 'PR 1',
          author: 'alice',
          url: 'https://github.com/owner/repo/pull/1',
        },
      ]

      const message = formatReminderMessage(prs, 'U2')
      const blocks = message.blocks as unknown[]
      const buttonBlocks = blocks.filter(
        (block: unknown) =>
          typeof block === 'object' &&
          block !== null &&
          'type' in block &&
          block.type === 'actions'
      )

      expect(buttonBlocks.length).toBeGreaterThan(0)
    })
  })

  describe('formatBlameMessage', () => {
    it('debe formatear mensaje de blame con PRs antiguos', () => {
      const prs: PRInfo[] = [
        {
          number: 1,
          title: 'Old PR',
          author: 'alice',
          url: 'https://github.com/owner/repo/pull/1',
          reviewers: ['bob'],
          reviewerSlackIds: ['U2'],
        },
      ]

      const message = formatBlameMessage(prs, 2, 'C123')

      expect(message.channel).toBe('C123')
      expect(message.text).toContain('2 día')
      expect(message.blocks).toBeDefined()
    })

    it('debe incluir menciones de reviewers', () => {
      const prs: PRInfo[] = [
        {
          number: 1,
          title: 'Old PR',
          author: 'alice',
          url: 'https://github.com/owner/repo/pull/1',
          reviewers: ['bob'],
          reviewerSlackIds: ['U2'],
        },
      ]

      const message = formatBlameMessage(prs, 2, 'C123')
      const blocks = message.blocks as unknown[]
      const reviewersBlock = blocks.find(
        (block: unknown) =>
          typeof block === 'object' &&
          block !== null &&
          'type' in block &&
          block.type === 'section' &&
          'text' in block &&
          typeof (block as { text: { text: string } }).text.text === 'string' &&
          (block as { text: { text: string } }).text.text.includes('Revisores')
      ) as { text?: { text: string } } | undefined

      if (reviewersBlock?.text?.text) {
        expect(reviewersBlock.text.text).toContain('<@U2>')
      } else {
        // Si no hay bloque de reviewers, verificar en otro lugar
        const allBlocks = message.blocks as unknown[]
        const reviewerText = JSON.stringify(allBlocks).includes('<@U2>')
        expect(reviewerText).toBe(true)
      }
    })
  })
})
