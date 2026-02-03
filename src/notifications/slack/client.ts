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
   * Envía un mensaje a Slack (canal o DM).
   * Para DMs: primero conversations.open (obtiene channel id), luego chat.postMessage.
   * Para canal: solo chat.postMessage.
   */
  async sendMessage(message: SlackMessage): Promise<void> {
    try {
      let channel = message.channel

      if (message.user) {
        // DM: conversations.open solo abre la conversación y devuelve channel.id; no envía el mensaje.
        const openUrl = `${this.apiBaseUrl}/conversations.open`
        const openBody = { users: [message.user] }
        const openResponse = await fetch(openUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
          },
          body: JSON.stringify(openBody),
        })
        const openResponseText = await openResponse.text()

        if (!openResponse.ok) {
          logger.error(
            { status: openResponse.status, error: openResponseText, userId: message.user },
            'Slack conversations.open failed (open DM channel)'
          )
          throw new Error(`Slack API error: ${openResponse.status} ${openResponseText}`)
        }

        let openData: { ok?: boolean; channel?: { id: string }; error?: string }
        try {
          openData = JSON.parse(openResponseText) as { ok?: boolean; channel?: { id: string }; error?: string }
        } catch {
          throw new Error(`Slack conversations.open invalid JSON: ${openResponseText}`)
        }
        if (!openData.ok || !openData.channel?.id) {
          logger.error(
            { response: openData, userId: message.user },
            'Slack conversations.open returned ok=false or missing channel.id'
          )
          throw new Error(`Slack conversations.open failed: ${openData.error ?? openResponseText}`)
        }
        channel = openData.channel.id
        logger.debug({ channelId: channel, userId: message.user }, 'Slack DM channel opened')
      }

      // Enviar mensaje (canal o DM ya abierto)
      const postUrl = `${this.apiBaseUrl}/chat.postMessage`
      const postBody: Record<string, unknown> = {
        channel,
        text: message.text,
      }
      if (message.blocks) {
        postBody.blocks = message.blocks
      }

      const postResponse = await fetch(postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify(postBody),
      })
      const postResponseText = await postResponse.text()

      if (!postResponse.ok) {
        logger.error(
          { status: postResponse.status, error: postResponseText, channel },
          'Slack chat.postMessage failed'
        )
        throw new Error(`Slack API error: ${postResponse.status} ${postResponseText}`)
      }

      let postData: { ok?: boolean; error?: string } | undefined
      try {
        postData = JSON.parse(postResponseText) as { ok?: boolean; error?: string }
      } catch {
        postData = undefined
        logger.debug({ raw: postResponseText }, 'Slack chat.postMessage response (parse skipped)')
      }
      if (postData && !postData.ok) {
        logger.warn({ response: postData, channel }, 'Slack chat.postMessage returned ok=false')
      }
      logger.debug({ channel }, 'Slack message sent successfully')
    } catch (error) {
      logger.error({ error, message }, 'Error sending Slack message')
      throw error
    }
  }
}
