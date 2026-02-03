import { RepositoryConfig } from '../config/repository.js'
import { logger } from '../utils/logger.js'
import type { GitHubClient } from '../github/client.js'

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

  /**
   * Asigna revisores usando la estrategia configurada
   * Versión síncrona (fallback si no hay repositoryId)
   */
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
      }, 'No available members after filtering author. Team config is loaded from the PR base branch; ensure .pr-sheriff.yml on that branch lists more than the author.')
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

  /**
   * Asigna revisores usando la estrategia configurada con persistencia
   * Versión async que soporta persistencia para round-robin y least-busy
   * @param repositoryId ID del repositorio (formato: `${installationId}/${owner}/${repo}`)
   * @param githubClient Cliente de GitHub (necesario para least-busy)
   * @param installationId ID de instalación de GitHub
   * @param owner Owner del repositorio
   * @param repo Nombre del repositorio
   */
  async assignReviewersWithPersistence(
    members: TeamMember[],
    pr: PullRequest,
    config: RepositoryConfig,
    repositoryId: string,
    githubClient?: GitHubClient,
    installationId?: string,
    owner?: string,
    repo?: string
  ): Promise<TeamMember[]> {
    logger.debug({ 
      membersCount: members.length,
      members: members.map(m => m.github),
      author: pr.author,
      excludeAuthors: config.github.auto_assign.exclude_authors,
      repositoryId,
    }, 'Starting reviewer assignment with persistence')

    // Filtrar autor si está configurado (antes de cualquier estrategia o fallback)
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
      }, 'No available members after filtering author. Team config is loaded from the PR base branch; ensure .pr-sheriff.yml on that branch lists more than the author.')
      return []
    }

    const strategyName = config.github.auto_assign.assignment_strategy
    const strategy = this.strategies.get(strategyName)

    if (!strategy) {
      logger.warn({ strategy: strategyName }, 'Unknown assignment strategy, using round-robin')
      // Fallback a round-robin
      const roundRobin = this.strategies.get('round-robin')
      if (!roundRobin) {
        throw new Error('No assignment strategy available')
      }
      // Si es round-robin, usar versión async
      if ('selectReviewersAsync' in roundRobin) {
        const roundRobinStrategy = roundRobin as { selectReviewersAsync: (members: TeamMember[], pr: PullRequest, config: RepositoryConfig, repositoryId: string) => Promise<TeamMember[]> }
        const selected = await roundRobinStrategy.selectReviewersAsync(availableMembers, pr, config, repositoryId)
        const count = config.github.auto_assign.reviewers_per_pr
        return selected.slice(0, count)
      }
      const selected = roundRobin.selectReviewers(availableMembers, pr, config)
      const count = config.github.auto_assign.reviewers_per_pr
      return selected.slice(0, count)
    }

    // Si es round-robin, usar versión async con persistencia
    if (strategyName === 'round-robin' && 'selectReviewersAsync' in strategy) {
      const roundRobinStrategy = strategy as { selectReviewersAsync: (members: TeamMember[], pr: PullRequest, config: RepositoryConfig, repositoryId: string) => Promise<TeamMember[]> }
      const selected = await roundRobinStrategy.selectReviewersAsync(availableMembers, pr, config, repositoryId)
      const count = config.github.auto_assign.reviewers_per_pr
      const finalSelection = selected.slice(0, count)

      logger.debug({ 
        selectedCount: finalSelection.length,
        selected: finalSelection.map(m => m.github),
        requestedCount: count
      }, 'Reviewer assignment with persistence completed')

      return finalSelection
    }

    // Si es least-busy, usar versión async que consulta GitHub
    if (strategyName === 'least-busy' && 'selectReviewersAsync' in strategy && githubClient && installationId && owner && repo) {
      const leastBusyStrategy = strategy as { selectReviewersAsync: (members: TeamMember[], pr: PullRequest, config: RepositoryConfig, githubClient: GitHubClient, installationId: string, owner: string, repo: string) => Promise<TeamMember[]> }
      const selected = await leastBusyStrategy.selectReviewersAsync(availableMembers, pr, config, githubClient, installationId, owner, repo)
      const count = config.github.auto_assign.reviewers_per_pr
      const finalSelection = selected.slice(0, count)

      logger.debug({ 
        selectedCount: finalSelection.length,
        selected: finalSelection.map(m => m.github),
        requestedCount: count
      }, 'Reviewer assignment with least-busy completed')

      return finalSelection
    }

    // Para otras estrategias, usar versión síncrona
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
