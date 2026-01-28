import { AssignmentStrategy, TeamMember, PullRequest } from '../engine.js'
import { RepositoryConfig } from '../../config/repository.js'

/**
 * Random strategy: random selection excluding PR author
 * 
 * Key characteristics:
 * - Non-deterministic: random selection
 * - No external state: pure function, no state needed
 * - Does NOT query GitHub API
 * - Stateless-friendly: works in Phase 1 without persistence
 */
export class RandomStrategy implements AssignmentStrategy {
  selectReviewers(
    members: TeamMember[],
    _pr: PullRequest,
    _config: RepositoryConfig
  ): TeamMember[] {
    if (members.length === 0) {
      return []
    }

    // Shuffle array (Fisher-Yates)
    const shuffled = [...members]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    return shuffled
  }
}
