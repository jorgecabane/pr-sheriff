import { AssignmentStrategy, TeamMember, PullRequest } from '../engine.js'
import { RepositoryConfig } from '../../config/repository.js'
import { logger } from '../../utils/logger.js'

/**
 * Least-busy strategy (NOT IMPLEMENTED - Requires Phase 2)
 * 
 * This strategy requires querying GitHub API to determine current reviewer load.
 * It is fundamentally different from round-robin:
 * - Round-robin: deterministic, sequential, no external state needed
 * - Least-busy: requires querying GitHub API for current PR assignments
 * 
 * This is a placeholder that falls back to round-robin behavior.
 * Real implementation requires:
 * 1. Query GitHub API for each team member's current PR assignments
 * 2. Sort by load (fewest PRs first)
 * 3. Select reviewers from least busy members
 */
export class LeastBusyStrategy implements AssignmentStrategy {
  selectReviewers(
    members: TeamMember[],
    pr: PullRequest,
    _config: RepositoryConfig
  ): TeamMember[] {
    if (members.length === 0) {
      return []
    }

    logger.warn(
      { prNumber: pr.number },
      'Least-busy strategy not implemented. Falling back to alphabetical order. Requires Phase 2 (GitHub API queries).'
    )

    // Fallback: alphabetical order (not a real least-busy implementation)
    // TODO (Phase 2): Query GitHub API to get current PR assignments per member
    // TODO (Phase 2): Sort by load and select least busy reviewers
    return [...members].sort((a, b) => a.github.localeCompare(b.github))
  }
}
