import { SlackClient, SlackMessage } from './slack/client.js'
import { GlobalConfig } from '../config/global.js'
import { logger } from '../utils/logger.js'

export class NotificationEngine {
  private slackClient: SlackClient
  private retryConfig: { maxAttempts: number; backoffMs: number }

  constructor(config: GlobalConfig) {
    this.slackClient = new SlackClient(config)
    // Mapear snake_case a camelCase
    this.retryConfig = {
      maxAttempts: config.notifications.retry.max_attempts,
      backoffMs: config.notifications.retry.backoff_ms,
    }
  }

  /**
   * Envía una notificación con retry automático
   */
  async send(message: SlackMessage): Promise<void> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        await this.slackClient.sendMessage(message)
        return
      } catch (error) {
        lastError = error as Error
        logger.warn(
          { attempt, maxAttempts: this.retryConfig.maxAttempts, error },
          'Failed to send notification, retrying'
        )

        if (attempt < this.retryConfig.maxAttempts) {
          const backoff = this.retryConfig.backoffMs * Math.pow(2, attempt - 1)
          await new Promise(resolve => setTimeout(resolve, backoff))
        }
      }
    }

    logger.error(
      { message, error: lastError },
      'Failed to send notification after all retries'
    )
    throw lastError
  }
}
