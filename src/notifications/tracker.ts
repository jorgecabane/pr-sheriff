import { eq } from 'drizzle-orm'
import { getDatabase, isDatabaseAvailable } from '../db/client.js'
import { notifications } from '../db/schema.js'
import { logger } from '../utils/logger.js'

export type NotificationType = 'new_pr' | 'reminder' | 'blame'

export interface NotificationMetadata {
  reviewers?: string[]
  labels?: string[]
  author?: string
  title?: string
  [key: string]: unknown
}

/** Fila de notificación tal como viene de la DB */
type NotificationRow = typeof notifications.$inferSelect

/**
 * Servicio para trackear notificaciones enviadas y evitar duplicados.
 * Encapsula todo el acceso a la tabla notifications en un solo lugar.
 */
export class NotificationTracker {
  /**
   * Construye el ID lógico de la notificación (único por tipo + contexto).
   * @returns null si falta información para construir el ID
   */
  private buildNotificationId(
    type: NotificationType,
    deliveryId?: string,
    prId?: string,
    recipient?: string
  ): string | null {
    if (type === 'new_pr' && deliveryId) {
      return `${type}/${deliveryId}`
    }
    if (prId && recipient) {
      return `${type}/${prId}/${recipient}`
    }
    return null
  }

  /**
   * Consulta la DB por un registro existente (único punto de lectura para "ya enviado").
   */
  private async getExistingNotification(notificationId: string): Promise<NotificationRow | undefined> {
    const db = getDatabase()
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1)
    return rows[0]
  }

  /**
   * Verifica si una notificación ya fue enviada
   * @param type Tipo de notificación
   * @param deliveryId GitHub webhook delivery ID (para new_pr)
   * @param prId ID del PR (opcional, para reminders/blame)
   * @param recipient Slack user ID o channel ID
   * @returns true si ya fue enviada, false si no
   */
  async wasSent(
    type: NotificationType,
    deliveryId?: string,
    prId?: string,
    recipient?: string
  ): Promise<boolean> {
    if (!isDatabaseAvailable()) {
      logger.debug({ type, deliveryId, prId, recipient }, 'Database not available, skipping notification tracking (may allow duplicates)')
      return false
    }

    const notificationId = this.buildNotificationId(type, deliveryId, prId, recipient)
    if (!notificationId) {
      logger.warn({ type, deliveryId, prId, recipient }, 'Insufficient info to check notification')
      return false
    }

    try {
      const existing = await this.getExistingNotification(notificationId)
      return existing !== undefined
    } catch (error) {
      logger.error({ error, type, deliveryId, prId, recipient }, 'Error checking notification status')
      return false
    }
  }

  /**
   * Registra una notificación como enviada
   * @param type Tipo de notificación
   * @param deliveryId GitHub webhook delivery ID (para new_pr)
   * @param prId ID del PR (opcional)
   * @param recipient Slack user ID o channel ID
   * @param metadata Información adicional (reviewers, labels, etc.)
   */
  async markAsSent(
    type: NotificationType,
    deliveryId: string | undefined,
    prId: string | undefined,
    recipient: string,
    metadata?: NotificationMetadata
  ): Promise<void> {
    if (!isDatabaseAvailable()) {
      logger.debug({ type, deliveryId, prId, recipient }, 'Database not available, skipping notification marking (may allow duplicates)')
      return
    }

    const notificationId = this.buildNotificationId(type, deliveryId, prId, recipient)
    if (!notificationId) {
      logger.warn({ type, deliveryId, prId, recipient }, 'Cannot create notification ID, insufficient info')
      return
    }

    try {
      const db = getDatabase()
      // pr_id tiene FK a pull_requests.id; para reminder/blame usamos prId solo como clave lógica (ej. reviewer/login), no como PR real
      const prIdForDb =
        type === 'reminder' || type === 'blame' ? null : (prId || null)

      await db.insert(notifications).values({
        id: notificationId,
        type,
        deliveryId: deliveryId || null,
        prId: prIdForDb,
        recipient,
        metadata: metadata || null,
      })

      logger.debug({ notificationId, type, recipient }, 'Notification marked as sent')
    } catch (error) {
      logger.error({ error, type, deliveryId, prId, recipient }, 'Error marking notification as sent')
    }
  }

  /**
   * Verifica y marca como enviada en una sola operación (idempotente)
   * Útil para evitar race conditions
   *
   * Para reminders: compara los PRs actuales (metadata.prNumbers) con los del último reminder.
   * Si cambiaron, actualiza el registro y retorna false (enviar nuevo reminder).
   *
   * @returns true si ya estaba enviada (con los mismos PRs), false si es nueva o PRs cambiaron
   */
  async checkAndMark(
    type: NotificationType,
    deliveryId: string | undefined,
    prId: string | undefined,
    recipient: string,
    metadata?: NotificationMetadata
  ): Promise<boolean> {
    if (!isDatabaseAvailable()) {
      logger.debug({ type, deliveryId, prId, recipient }, 'Database not available, allowing notification')
      return false
    }

    const notificationId = this.buildNotificationId(type, deliveryId, prId, recipient)
    if (!notificationId) {
      logger.warn({ type, deliveryId, prId, recipient }, 'Insufficient info to check notification')
      return false
    }

    try {
      const existing = await this.getExistingNotification(notificationId)

      if (!existing) {
        await this.markAsSent(type, deliveryId, prId, recipient, metadata)
        return false
      }

      // Para reminders: comparar PRs actuales con los del último reminder
      if (type === 'reminder' && metadata?.prNumbers) {
        const previousMeta = existing.metadata as NotificationMetadata | null
        const previousPRs = (previousMeta?.prNumbers as number[]) || []
        const currentPRs = (metadata.prNumbers as number[]) || []

        const prevSet = new Set(previousPRs)
        const sameSize = prevSet.size === currentPRs.length
        const sameContent = sameSize && currentPRs.every(pr => prevSet.has(pr))

        if (!sameContent) {
          logger.info(
            { notificationId, previousPRs, currentPRs },
            'Reminder PRs changed, sending new reminder'
          )
          const db = getDatabase()
          await db
            .update(notifications)
            .set({
              metadata: metadata || null,
              sentAt: new Date(),
            })
            .where(eq(notifications.id, notificationId))
          return false
        }

        logger.debug(
          { notificationId, prNumbers: currentPRs },
          'Reminder already sent for same PRs, skipping'
        )
        return true
      }

      return true
    } catch (error) {
      logger.error({ error, type, deliveryId, prId, recipient }, 'Error in checkAndMark')
      return false
    }
  }
}

/**
 * Instancia singleton del tracker
 */
let trackerInstance: NotificationTracker | null = null

export function getNotificationTracker(): NotificationTracker {
  if (!trackerInstance) {
    trackerInstance = new NotificationTracker()
  }
  return trackerInstance
}
