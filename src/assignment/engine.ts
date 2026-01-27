import { RepositoryConfig } from '../config/repository.js'
import { logger } from '../utils/logger.js'

export interface TeamMember {
  github: string
  slack: string
}

export interface PullRequest {
  number: number
  author: string
  reviewers?: string[]
}

export interface AssignmentStrategy {
  selectReviewers(
    members: TeamMember[],
    pr: PullRequest,
    config: RepositoryConfig
  ): TeamMember[]
}

export class AssignmentEngine {
  private strategies: Map<string, AssignmentStrategy> = new Map()

  registerStrategy(name: string, strategy: AssignmentStrategy) {
    this.strategies.set(name, strategy)
    logger.debug({ strategy: name }, 'Registered assignment strategy')
  }

  assignReviewers(
    members: TeamMember[],
    pr: PullRequest,
    config: RepositoryConfig
  ): TeamMember[] {
    logger.debug({ 
      membersCount: members.length,
      members: members.map(m => m.github),
      author: pr.author,
      excludeAuthors: config.github.auto_assign.exclude_authors
    }, 'Starting reviewer assignment')

    const strategyName = config.github.auto_assign.assignment_strategy
    const strategy = this.strategies.get(strategyName)

    if (!strategy) {
      logger.warn({ strategy: strategyName }, 'Unknown assignment strategy, using round-robin')
      // Fallback a round-robin
      const roundRobin = this.strategies.get('round-robin')
      if (!roundRobin) {
        throw new Error('No assignment strategy available')
      }
      return roundRobin.selectReviewers(members, pr, config)
    }

    // Filtrar autor si está configurado
    let availableMembers = members
    if (config.github.auto_assign.exclude_authors) {
      availableMembers = members.filter(m => m.github !== pr.author)
      logger.debug({ 
        beforeFilter: members.length,
        afterFilter: availableMembers.length,
        excluded: pr.author,
        available: availableMembers.map(m => m.github)
      }, 'Filtered out PR author')
    }

    if (availableMembers.length === 0) {
      logger.warn({ 
        author: pr.author,
        totalMembers: members.length
      }, 'No available members after filtering author')
      return []
    }

    const selected = strategy.selectReviewers(availableMembers, pr, config)
    const count = config.github.auto_assign.reviewers_per_pr
    const finalSelection = selected.slice(0, count)

    logger.debug({ 
      selectedCount: finalSelection.length,
      selected: finalSelection.map(m => m.github),
      requestedCount: count
    }, 'Reviewer assignment completed')

    return finalSelection
  }
}
