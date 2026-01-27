import { logger } from '../../utils/logger.js'
import { GlobalConfig } from '../../config/global.js'

export interface SlackMessage {
  channel?: string
  user?: string // Para DMs
  text: string
  blocks?: unknown[]
}

export class SlackClient {
  private token: string
  private apiBaseUrl: string

  constructor(config: GlobalConfig) {
    this.token = config.slack.token
    this.apiBaseUrl = config.slack.api_base_url
  }

  /**
   * Envía un mensaje a Slack (canal o DM)
   */
  async sendMessage(message: SlackMessage): Promise<void> {
    try {
      const url = message.user
        ? `${this.apiBaseUrl}/conversations.open` // Para DMs
        : `${this.apiBaseUrl}/chat.postMessage`

      const body: Record<string, unknown> = {
        token: this.token,
        text: message.text,
      }

      if (message.channel) {
        body.channel = message.channel
      }

      if (message.user) {
        body.users = message.user
      }

      if (message.blocks) {
        body.blocks = message.blocks
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const error = await response.text()
        logger.error(
          { status: response.status, error, message },
          'Failed to send Slack message'
        )
        throw new Error(`Slack API error: ${response.status} ${error}`)
      }

      logger.debug({ message }, 'Slack message sent successfully')
    } catch (error) {
      logger.error({ error, message }, 'Error sending Slack message')
      throw error
    }
  }
}
