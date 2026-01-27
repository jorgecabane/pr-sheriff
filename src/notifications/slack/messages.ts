import { SlackMessage } from './client.js'
import { RepositoryConfig } from '../../config/repository.js'

export interface PRInfo {
  number: number
  title: string
  author: string
  url: string
  reviewers?: string[]
  description?: string
  labels?: string[]
}

/**
 * Formatea un mensaje para notificar un nuevo PR
 */
export function formatNewPRMessage(
  pr: PRInfo,
  config: RepositoryConfig
): SlackMessage {
  const channel = config.notifications.new_pr_notifications.channel
  let text = `🔔 Nuevo PR: *${pr.title}* (#${pr.number})\n`
  text += `Autor: ${pr.author}\n`
  text += `<${pr.url}|Ver PR>`

  if (config.notifications.new_pr_notifications.include_reviewers && pr.reviewers) {
    text += `\nRevisores: ${pr.reviewers.map(r => `@${r}`).join(', ')}`
  }

  if (config.notifications.new_pr_notifications.include_description && pr.description) {
    text += `\n\n${pr.description}`
  }

  if (config.notifications.new_pr_notifications.include_labels && pr.labels) {
    text += `\nEtiquetas: ${pr.labels.join(', ')}`
  }

  return {
    channel,
    text,
  }
}

/**
 * Formatea un mensaje de reminder diario
 */
export function formatReminderMessage(
  prs: PRInfo[],
  reviewer: string
): SlackMessage {
  let text = `📋 Tienes ${prs.length} PR(s) pendiente(s) de revisar:\n\n`

  for (const pr of prs) {
    text += `• <${pr.url}|#${pr.number}: ${pr.title}> por ${pr.author}\n`
  }

  return {
    user: reviewer,
    text,
  }
}

/**
 * Formatea un mensaje de blame (PRs antiguos)
 */
export function formatBlameMessage(prs: PRInfo[], days: number): SlackMessage {
  let text = `⚠️ PRs con más de ${days} días abiertos:\n\n`

  for (const pr of prs) {
    text += `• <${pr.url}|#${pr.number}: ${pr.title}> por ${pr.author}\n`
  }

  return {
    text,
  }
}
