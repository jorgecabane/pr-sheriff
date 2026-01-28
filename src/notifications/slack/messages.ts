import { SlackMessage } from './client.js'
import { RepositoryConfig } from '../../config/repository.js'

export interface PRInfo {
  number: number
  title: string
  author: string
  url: string
  reviewers?: string[] // GitHub usernames
  reviewerSlackIds?: string[] // Slack user IDs (opcional, se mapea desde team members si no se proporciona)
  assignees?: string[] // GitHub usernames
  assigneeSlackIds?: string[] // Slack user IDs (opcional, se mapea desde team members si no se proporciona)
  description?: string
  labels?: string[]
}

export interface TeamMember {
  github: string
  slack: string
}

/**
 * Formatea un mensaje para notificar un nuevo PR usando Slack Blocks
 */
export function formatNewPRMessage(
  pr: PRInfo,
  config: RepositoryConfig
): SlackMessage {
  const channel = config.notifications.new_pr_notifications.channel
  const blocks: unknown[] = []

  // Header con título y link
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `🔔 Nuevo PR: ${pr.title}`,
      emoji: true,
    },
  })

  // Información principal en una sección
  const fields: Array<{ type: string; text: string; emoji?: boolean }> = [
    {
      type: 'mrkdwn',
      text: `*PR:* <${pr.url}|#${pr.number}>`,
    },
    {
      type: 'mrkdwn',
      text: `*Autor:* ${pr.author}`,
    },
  ]

  // Agregar revisores solo si hay y está habilitado
  if (
    config.notifications.new_pr_notifications.include_reviewers &&
    pr.reviewers &&
    pr.reviewers.length > 0
  ) {
    // Mapear GitHub usernames a Slack user IDs para menciones
    const reviewerMentions = pr.reviewerSlackIds
      ? pr.reviewerSlackIds.map(id => `<@${id}>`).join(', ')
      : pr.reviewers
          .map(githubUsername => {
            // Buscar el Slack ID del reviewer en la configuración del equipo
            const member = config.team.members.find(
              m => m.github === githubUsername
            )
            return member ? `<@${member.slack}>` : `@${githubUsername}`
          })
          .join(', ')

    fields.push({
      type: 'mrkdwn',
      text: `*Revisores:* ${reviewerMentions}`,
    })
  }

  // Agregar asignados solo si hay y está habilitado
  if (
    config.notifications.new_pr_notifications.include_assignees &&
    pr.assignees &&
    pr.assignees.length > 0
  ) {
    // Mapear GitHub usernames a Slack user IDs para menciones
    const assigneeMentions = pr.assigneeSlackIds
      ? pr.assigneeSlackIds.map(id => `<@${id}>`).join(', ')
      : pr.assignees
          .map(githubUsername => {
            // Buscar el Slack ID del assignee en la configuración del equipo
            const member = config.team.members.find(
              m => m.github === githubUsername
            )
            return member ? `<@${member.slack}>` : `@${githubUsername}`
          })
          .join(', ')

    fields.push({
      type: 'mrkdwn',
      text: `*Asignados:* ${assigneeMentions}`,
    })
  }

  // Agregar labels solo si hay y está habilitado
  if (
    config.notifications.new_pr_notifications.include_labels &&
    pr.labels &&
    pr.labels.length > 0
  ) {
    fields.push({
      type: 'mrkdwn',
      text: `*Etiquetas:* ${pr.labels.map(l => `\`${l}\``).join(', ')}`,
    })
  }

  blocks.push({
    type: 'section',
    fields,
  })

  // Descripción (si está habilitada y existe)
  if (
    config.notifications.new_pr_notifications.include_description &&
    pr.description &&
    pr.description.trim()
  ) {
    // Truncar descripción si es muy larga
    const maxLength = 300
    const description =
      pr.description.length > maxLength
        ? `${pr.description.substring(0, maxLength)}...`
        : pr.description

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_${description}_`,
      },
    })
  }

  // Botón de acción para ver el PR
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Ver PR',
          emoji: true,
        },
        url: pr.url,
        style: 'primary',
      },
    ],
  })

  // Texto simple como fallback (para notificaciones push)
  const text = `🔔 Nuevo PR: ${pr.title} (#${pr.number}) por ${pr.author} - ${pr.url}`

  return {
    channel,
    text, // Fallback text
    blocks,
  }
}

/**
 * Formatea un mensaje de reminder diario usando Slack Blocks
 */
export function formatReminderMessage(
  prs: PRInfo[],
  reviewerSlackId: string
): SlackMessage {
  const blocks: unknown[] = []

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `📋 Tienes ${prs.length} PR${prs.length > 1 ? 's' : ''} pendiente${prs.length > 1 ? 's' : ''} de revisar`,
      emoji: true,
    },
  })

  // Lista de PRs
  for (const pr of prs) {
    const fields: Array<{ type: string; text: string }> = [
      {
        type: 'mrkdwn',
        text: `*PR:* <${pr.url}|#${pr.number}: ${pr.title}>`,
      },
      {
        type: 'mrkdwn',
        text: `*Autor:* ${pr.author}`,
      },
    ]

    if (pr.labels && pr.labels.length > 0) {
      fields.push({
        type: 'mrkdwn',
        text: `*Etiquetas:* ${pr.labels.map(l => `\`${l}\``).join(', ')}`,
      })
    }

    blocks.push({
      type: 'section',
      fields,
    })

    // Botón para ver el PR
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Ver PR',
            emoji: true,
          },
          url: pr.url,
          style: 'primary',
        },
      ],
    })

    // Divider entre PRs (excepto el último)
    if (prs.indexOf(pr) < prs.length - 1) {
      blocks.push({
        type: 'divider',
      })
    }
  }

  // Texto de fallback
  const text = `📋 Tienes ${prs.length} PR${prs.length > 1 ? 's' : ''} pendiente${prs.length > 1 ? 's' : ''} de revisar:\n\n${prs.map(pr => `• ${pr.title} (#${pr.number}) - ${pr.url}`).join('\n')}`

  return {
    user: reviewerSlackId,
    text,
    blocks,
  }
}

/**
 * Formatea un mensaje de blame (PRs antiguos) usando Slack Blocks
 */
export function formatBlameMessage(
  prs: PRInfo[],
  days: number,
  channel: string
): SlackMessage {
  const blocks: unknown[] = []

  // Header con advertencia
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `⚠️ PRs con más de ${days} día${days > 1 ? 's' : ''} abierto${days > 1 ? 's' : ''}`,
      emoji: true,
    },
  })

  // Context con cantidad
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Se encontraron ${prs.length} PR${prs.length > 1 ? 's' : ''} que necesitan atención`,
      },
    ],
  })

  blocks.push({
    type: 'divider',
  })

  // Lista de PRs
  for (const pr of prs) {
    const fields: Array<{ type: string; text: string }> = [
      {
        type: 'mrkdwn',
        text: `*PR:* <${pr.url}|#${pr.number}: ${pr.title}>`,
      },
      {
        type: 'mrkdwn',
        text: `*Autor:* ${pr.author}`,
      },
    ]

    // Agregar revisores si hay
    if (pr.reviewers && pr.reviewers.length > 0) {
      const reviewerMentions = pr.reviewerSlackIds
        ? pr.reviewerSlackIds.map(id => `<@${id}>`).join(', ')
        : pr.reviewers.map(r => `@${r}`).join(', ')

      fields.push({
        type: 'mrkdwn',
        text: `*Revisores:* ${reviewerMentions}`,
      })
    }

    if (pr.labels && pr.labels.length > 0) {
      fields.push({
        type: 'mrkdwn',
        text: `*Etiquetas:* ${pr.labels.map(l => `\`${l}\``).join(', ')}`,
      })
    }

    blocks.push({
      type: 'section',
      fields,
    })

    // Botón para ver el PR
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Ver PR',
            emoji: true,
          },
          url: pr.url,
          style: 'danger', // Rojo para indicar urgencia
        },
      ],
    })

    // Divider entre PRs (excepto el último)
    if (prs.indexOf(pr) < prs.length - 1) {
      blocks.push({
        type: 'divider',
      })
    }
  }

  // Texto de fallback
  const text = `⚠️ PRs con más de ${days} día${days > 1 ? 's' : ''} abierto${days > 1 ? 's' : ''}:\n\n${prs.map(pr => `• ${pr.title} (#${pr.number}) por ${pr.author} - ${pr.url}`).join('\n')}`

  return {
    channel,
    text,
    blocks,
  }
}
