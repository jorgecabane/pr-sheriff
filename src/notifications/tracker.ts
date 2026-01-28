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

/**
 * Servicio para trackear notificaciones enviadas y evitar duplicados
 */
export class NotificationTracker {
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
    // Si no hay DB disponible, retornar false (no fue enviado) para permitir el envío
    // Esto significa que podría haber duplicados, pero el sistema seguirá funcionando
    if (!isDatabaseAvailable()) {
      logger.debug({ type, deliveryId, prId, recipient }, 'Database not available, skipping notification tracking (may allow duplicates)')
      return false
    }

    try {
      const db = getDatabase()

      // Construir el ID de la notificación según el tipo
      let notificationId: string

      if (type === 'new_pr' && deliveryId) {
        // Para new_pr, usar delivery_id como key único
        notificationId = `${type}/${deliveryId}`
      } else if (prId && recipient) {
        // Para reminders/blame, usar prId + recipient
        notificationId = `${type}/${prId}/${recipient}`
      } else {
        // Si no hay suficiente info, no podemos verificar
        logger.warn({ type, deliveryId, prId, recipient }, 'Insufficient info to check notification')
        return false
      }

      const result = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notificationId))
        .limit(1)

      return result.length > 0
    } catch (error) {
      // Si hay error (DB no disponible, etc.), loguear y retornar false
      // Esto permite que el sistema continúe funcionando sin tracking
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
    // Si no hay DB disponible, simplemente no marcar (no tracking)
    // Esto significa que podría haber duplicados, pero el sistema seguirá funcionando
    if (!isDatabaseAvailable()) {
      logger.debug({ type, deliveryId, prId, recipient }, 'Database not available, skipping notification marking (may allow duplicates)')
      return
    }

    try {
      const db = getDatabase()

      // Construir el ID de la notificación
      let notificationId: string

      if (type === 'new_pr' && deliveryId) {
        notificationId = `${type}/${deliveryId}`
      } else if (prId) {
        notificationId = `${type}/${prId}/${recipient}`
      } else {
        logger.warn({ type, deliveryId, prId, recipient }, 'Cannot create notification ID, insufficient info')
        return
      }

      await db.insert(notifications).values({
        id: notificationId,
        type,
        deliveryId: deliveryId || null,
        prId: prId || null,
        recipient,
        metadata: metadata || null,
      })

      logger.debug({ notificationId, type, recipient }, 'Notification marked as sent')
    } catch (error) {
      // Si hay error, loguear pero no fallar
      // Esto permite que el sistema continúe funcionando sin tracking
      logger.error({ error, type, deliveryId, prId, recipient }, 'Error marking notification as sent')
    }
  }

  /**
   * Verifica y marca como enviada en una sola operación (idempotente)
   * Útil para evitar race conditions
   * @returns true si ya estaba enviada, false si es nueva
   */
  async checkAndMark(
    type: NotificationType,
    deliveryId: string | undefined,
    prId: string | undefined,
    recipient: string,
    metadata?: NotificationMetadata
  ): Promise<boolean> {
    const wasAlreadySent = await this.wasSent(type, deliveryId, prId, recipient)

    if (!wasAlreadySent) {
      await this.markAsSent(type, deliveryId, prId, recipient, metadata)
      return false
    }

    return true
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
