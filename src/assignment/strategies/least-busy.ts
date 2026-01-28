import { AssignmentStrategy, TeamMember, PullRequest } from '../engine.js'
import { RepositoryConfig } from '../../config/repository.js'
import { logger } from '../../utils/logger.js'
import { GitHubClient } from '../../github/client.js'

/**
 * Least-busy strategy: selects reviewers based on current workload
 * 
 * This strategy queries GitHub API to determine current reviewer load:
 * 1. Query GitHub API for each team member's current PR assignments
 * 2. Count PRs where the member is a requested reviewer
 * 3. Sort by load (fewest PRs first)
 * 4. Select reviewers from least busy members
 * 
 * Key characteristics:
 * - Requires GitHub API queries (async)
 * - Load-based: distributes work evenly
 * - Real-time: uses current PR assignments
 */
export class LeastBusyStrategy implements AssignmentStrategy {
  /**
   * Versión async que consulta GitHub para obtener carga actual
   */
  async selectReviewersAsync(
    members: TeamMember[],
    pr: PullRequest,
    config: RepositoryConfig,
    githubClient: GitHubClient,
    installationId: string,
    owner: string,
    repo: string
  ): Promise<TeamMember[]> {
    if (members.length === 0) {
      return []
    }

    try {
      logger.debug({ owner, repo, membersCount: members.length }, 'Querying GitHub for reviewer load')

      // 1. Obtener todos los PRs abiertos del repositorio
      const openPRs = await githubClient.listAllOpenPullRequests(installationId, owner, repo)

      // 2. Contar PRs por reviewer
      const reviewerLoad = new Map<string, number>()

      // Inicializar todos los miembros con carga 0
      for (const member of members) {
        reviewerLoad.set(member.github.toLowerCase(), 0)
      }

      // Contar PRs donde cada miembro es reviewer
      for (const prItem of openPRs) {
        // Ignorar el PR actual (el que estamos asignando)
        if (prItem.number === pr.number) {
          continue
        }

        // Filtrar PRs draft si está configurado
        if (prItem.draft && config.rules.exclude_labels?.includes('draft')) {
          continue
        }

        // Filtrar por labels excluidas
        const hasExcludedLabel = prItem.labels.some(label =>
          config.rules.exclude_labels?.includes(label.name)
        )
        if (hasExcludedLabel) {
          continue
        }

        // Contar cada reviewer asignado
        const reviewers = prItem.requested_reviewers || []
        for (const reviewer of reviewers) {
          const reviewerLogin = reviewer.login.toLowerCase()
          if (reviewerLoad.has(reviewerLogin)) {
            reviewerLoad.set(reviewerLogin, (reviewerLoad.get(reviewerLogin) || 0) + 1)
          }
        }
      }

      // 3. Ordenar miembros por carga (menos ocupados primero)
      const membersWithLoad = members.map(member => ({
        member,
        load: reviewerLoad.get(member.github.toLowerCase()) || 0,
      }))

      membersWithLoad.sort((a, b) => {
        // Primero por carga (menos PRs primero)
        if (a.load !== b.load) {
          return a.load - b.load
        }
        // Si tienen la misma carga, ordenar alfabéticamente para consistencia
        return a.member.github.localeCompare(b.member.github)
      })

      logger.info({
        owner,
        repo,
        loads: membersWithLoad.map(m => ({ reviewer: m.member.github, load: m.load })),
      }, 'Calculated reviewer load')

      // 4. Retornar miembros ordenados por carga
      return membersWithLoad.map(m => m.member)
    } catch (error) {
      logger.error({ error, owner, repo }, 'Error querying GitHub for reviewer load, falling back to alphabetical order')
      // Fallback a orden alfabético si hay error
      return [...members].sort((a, b) => a.github.localeCompare(b.github))
    }
  }

  /**
   * Versión síncrona (fallback si no hay acceso a GitHub)
   */
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
      'Least-busy strategy used without GitHub access, falling back to alphabetical order'
    )

    // Fallback: alphabetical order
    return [...members].sort((a, b) => a.github.localeCompare(b.github))
  }
}
