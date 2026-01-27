import { AssignmentStrategy, TeamMember, PullRequest } from '../engine.js'
import { RepositoryConfig } from '../../config/repository.js'

/**
 * Round-robin strategy: deterministic sequential assignment
 * 
 * Key characteristics:
 * - Deterministic: sequential rotation based on team member order
 * - No external state: only uses minimal local state (last assigned index)
 * - Does NOT query GitHub API
 * - Stateless-friendly: works in Phase 1 without persistence
 */
const lastAssignedIndex = new Map<string, number>()

export class RoundRobinStrategy implements AssignmentStrategy {
  selectReviewers(
    members: TeamMember[],
    _pr: PullRequest,
    _config: RepositoryConfig
  ): TeamMember[] {
    if (members.length === 0) {
      return []
    }

    // Usar repo como key para el round-robin
    const key = `${_pr.number}` // TODO: Usar repo full name cuando esté disponible
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
