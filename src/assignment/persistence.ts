import { eq } from 'drizzle-orm'
import { getDatabase } from '../db/client.js'
import { assignmentHistory } from '../db/schema.js'
import { logger } from '../utils/logger.js'

/**
 * Servicio para manejar la persistencia del historial de asignaciones
 */
export class AssignmentPersistence {
  /**
   * Obtiene el último reviewer asignado para un repositorio y estrategia
   * @param repositoryId ID del repositorio (formato: `${installationId}/${owner}/${repo}`)
   * @param strategy Nombre de la estrategia ('round-robin', 'random', etc.)
   * @returns GitHub username del último reviewer asignado, o null si no hay historial
   */
  async getLastAssignedReviewer(
    repositoryId: string,
    strategy: string
  ): Promise<string | null> {
    try {
      const db = getDatabase()
      const historyId = `${repositoryId}/${strategy}`

      const result = await db
        .select()
        .from(assignmentHistory)
        .where(eq(assignmentHistory.id, historyId))
        .limit(1)

      if (result.length === 0) {
        logger.debug({ repositoryId, strategy }, 'No assignment history found')
        return null
      }

      return result[0].lastAssignedReviewer
    } catch (error) {
      // Si hay error (DB no disponible, etc.), loguear y retornar null
      // Esto permite que el sistema continúe funcionando sin persistencia
      logger.error({ error, repositoryId, strategy }, 'Error getting last assigned reviewer')
      return null
    }
  }

  /**
   * Guarda el último reviewer asignado para un repositorio y estrategia
   * @param repositoryId ID del repositorio (formato: `${installationId}/${owner}/${repo}`)
   * @param strategy Nombre de la estrategia ('round-robin', 'random', etc.)
   * @param reviewer GitHub username del reviewer asignado
   */
  async saveLastAssignedReviewer(
    repositoryId: string,
    strategy: string,
    reviewer: string
  ): Promise<void> {
    try {
      const db = getDatabase()
      const historyId = `${repositoryId}/${strategy}`

      // Intentar actualizar primero
      const existing = await db
        .select()
        .from(assignmentHistory)
        .where(eq(assignmentHistory.id, historyId))
        .limit(1)

      if (existing.length > 0) {
        // Actualizar registro existente
        await db
          .update(assignmentHistory)
          .set({
            lastAssignedReviewer: reviewer,
            lastAssignedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(assignmentHistory.id, historyId))

        logger.debug({ repositoryId, strategy, reviewer }, 'Updated assignment history')
      } else {
        // Crear nuevo registro
        await db.insert(assignmentHistory).values({
          id: historyId,
          repositoryId,
          strategy,
          lastAssignedReviewer: reviewer,
          lastAssignedAt: new Date(),
          updatedAt: new Date(),
        })

        logger.debug({ repositoryId, strategy, reviewer }, 'Created assignment history')
      }
    } catch (error) {
      // Si hay error, loguear pero no fallar
      // Esto permite que el sistema continúe funcionando sin persistencia
      logger.error({ error, repositoryId, strategy, reviewer }, 'Error saving assignment history')
    }
  }

  /**
   * Encuentra el índice del último reviewer en la lista de miembros
   * Útil para round-robin que necesita saber desde dónde continuar
   */
  async getLastAssignedIndex(
    repositoryId: string,
    strategy: string,
    members: Array<{ github: string }>
  ): Promise<number> {
    const lastReviewer = await this.getLastAssignedReviewer(repositoryId, strategy)

    if (!lastReviewer) {
      return -1 // No hay historial, empezar desde el principio
    }

    const index = members.findIndex(
      m => m.github.toLowerCase() === lastReviewer.toLowerCase()
    )

    if (index === -1) {
      // El último reviewer ya no está en el equipo, empezar desde el principio
      logger.debug({ repositoryId, strategy, lastReviewer }, 'Last reviewer not in team anymore, resetting')
      return -1
    }

    return index
  }
}

/**
 * Instancia singleton del servicio de persistencia
 */
let persistenceInstance: AssignmentPersistence | null = null

export function getAssignmentPersistence(): AssignmentPersistence {
  if (!persistenceInstance) {
    persistenceInstance = new AssignmentPersistence()
  }
  return persistenceInstance
}
