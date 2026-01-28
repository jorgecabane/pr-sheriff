import { AssignmentStrategy, TeamMember, PullRequest } from '../engine.js'
import { RepositoryConfig } from '../../config/repository.js'
import { getAssignmentPersistence } from '../persistence.js'
import { logger } from '../../utils/logger.js'

/**
 * Round-robin strategy: deterministic sequential assignment with persistence
 * 
 * Key characteristics:
 * - Deterministic: sequential rotation based on team member order
 * - Persistent: uses database to track last assigned reviewer per repository
 * - Does NOT query GitHub API
 * - Falls back to in-memory state if DB is unavailable
 */
// Fallback in-memory state si la DB no está disponible
const lastAssignedIndex = new Map<string, number>()

export class RoundRobinStrategy implements AssignmentStrategy {
  async selectReviewersAsync(
    members: TeamMember[],
    pr: PullRequest,
    config: RepositoryConfig,
    repositoryId: string
  ): Promise<TeamMember[]> {
    if (members.length === 0) {
      return []
    }

    try {
      const persistence = getAssignmentPersistence()
      const lastIndex = await persistence.getLastAssignedIndex(
        repositoryId,
        'round-robin',
        members
      )

      const nextIndex = (lastIndex + 1) % members.length
      const selected = members[nextIndex]

      // Guardar el reviewer seleccionado
      await persistence.saveLastAssignedReviewer(
        repositoryId,
        'round-robin',
        selected.github
      )

      // Rotar array empezando desde nextIndex
      const rotated = [
        ...members.slice(nextIndex),
        ...members.slice(0, nextIndex),
      ]

      logger.debug({
        repositoryId,
        lastIndex,
        nextIndex,
        selected: selected.github,
      }, 'Round-robin selection with persistence')

      return rotated
    } catch (error) {
      // Fallback a in-memory si hay error
      logger.warn({ error, repositoryId }, 'Failed to use persistent round-robin, falling back to in-memory')
      return this.selectReviewers(members, pr, config)
    }
  }

  /**
   * Versión síncrona (fallback si no hay repositoryId o DB no disponible)
   */
  selectReviewers(
    members: TeamMember[],
    pr: PullRequest,
    _config: RepositoryConfig
  ): TeamMember[] {
    if (members.length === 0) {
      return []
    }

    // Usar PR number como key para fallback in-memory
    const key = `pr-${pr.number}`
    const lastIndex = lastAssignedIndex.get(key) ?? -1
    const nextIndex = (lastIndex + 1) % members.length

    lastAssignedIndex.set(key, nextIndex)

    // Rotar array empezando desde nextIndex
    const rotated = [
      ...members.slice(nextIndex),
      ...members.slice(0, nextIndex),
    ]

    return rotated
  }
}
