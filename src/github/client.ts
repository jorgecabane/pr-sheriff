import { getInstallationToken } from './auth.js'
import { GlobalConfig } from '../config/global.js'
import { logger } from '../utils/logger.js'

/**
 * Tipos para PRs de GitHub
 */
export interface GitHubPullRequest {
  number: number
  title: string
  state: 'open' | 'closed'
  user: { login: string }
  html_url: string
  body: string | null
  labels: Array<{ name: string }>
  requested_reviewers?: Array<{ login: string }>
  requested_teams?: Array<{ name: string }>
  base: { ref: string }
  head: { ref: string }
  created_at: string
  updated_at: string
  draft?: boolean
}

export class GitHubClient {
  private appId: string
  private privateKeyPath?: string
  private privateKeyContent?: string

  constructor(config: GlobalConfig) {
    this.appId = config.github.app_id
    this.privateKeyPath = config.github.private_key_path || undefined
    this.privateKeyContent = (config.github as { private_key_content?: string }).private_key_content || undefined
  }

  /**
   * Obtiene un token de instalación para hacer requests a la API
   */
  async getToken(installationId: string): Promise<string> {
    return getInstallationToken(
      installationId, 
      this.appId, 
      this.privateKeyPath, 
      this.privateKeyContent
    )
  }

  /**
   * Hace un request autenticado a la GitHub API
   */
  async request(
    installationId: string,
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const token = await this.getToken(installationId)
    
    const url = `https://api.github.com${path}`
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const error = await response.text()
      logger.error(
        { method, path, status: response.status, error },
        'GitHub API request failed'
      )
      throw new Error(`GitHub API error: ${response.status} ${error}`)
    }

    return response.json()
  }

  /**
   * Obtiene el contenido de un archivo del repositorio
   * @param ref - Branch, tag o commit SHA (opcional, por defecto usa la branch por defecto)
   */
  async getFileContent(
    installationId: string,
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<string> {
    // Construir URL con query parameter ref si se proporciona
    let url = `/repos/${owner}/${repo}/contents/${path}`
    if (ref) {
      url += `?ref=${encodeURIComponent(ref)}`
    }
    
    const response = await this.request(
      installationId,
      'GET',
      url
    ) as { content: string; encoding: string }

    // GitHub devuelve el contenido en base64
    if (response.encoding === 'base64') {
      return Buffer.from(response.content, 'base64').toString('utf-8')
    }
    
    return response.content
  }

  /**
   * Lista PRs abiertos de un repositorio
   * @param state - Estado de los PRs ('open', 'closed', 'all'). Por defecto 'open'
   * @param perPage - Cantidad de resultados por página (máx 100). Por defecto 30
   * @param page - Número de página. Por defecto 1
   */
  async listPullRequests(
    installationId: string,
    owner: string,
    repo: string,
    options?: {
      state?: 'open' | 'closed' | 'all'
      perPage?: number
      page?: number
    }
  ): Promise<GitHubPullRequest[]> {
    const state = options?.state || 'open'
    const perPage = Math.min(options?.perPage || 30, 100)
    const page = options?.page || 1

    const url = `/repos/${owner}/${repo}/pulls?state=${state}&per_page=${perPage}&page=${page}`
    
    const response = await this.request(
      installationId,
      'GET',
      url
    ) as GitHubPullRequest[]

    return response
  }

  /**
   * Obtiene un PR específico por número
   */
  async getPullRequest(
    installationId: string,
    owner: string,
    repo: string,
    number: number
  ): Promise<GitHubPullRequest> {
    const url = `/repos/${owner}/${repo}/pulls/${number}`
    
    const response = await this.request(
      installationId,
      'GET',
      url
    ) as GitHubPullRequest

    return response
  }

  /**
   * Lista todos los PRs abiertos de un repositorio (con paginación automática)
   * Útil para obtener todos los PRs sin preocuparse por la paginación
   */
  async listAllOpenPullRequests(
    installationId: string,
    owner: string,
    repo: string
  ): Promise<GitHubPullRequest[]> {
    const allPRs: GitHubPullRequest[] = []
    let page = 1
    const perPage = 100 // Máximo permitido por GitHub

    while (true) {
      const prs = await this.listPullRequests(installationId, owner, repo, {
        state: 'open',
        perPage,
        page,
      })

      if (prs.length === 0) {
        break
      }

      allPRs.push(...prs)

      // Si recibimos menos resultados que perPage, significa que es la última página
      if (prs.length < perPage) {
        break
      }

      page++
    }

    return allPRs
  }

  /**
   * Lista PRs abiertos donde un reviewer específico está asignado
   * Nota: GitHub API no tiene un endpoint directo para esto,
   * así que filtramos después de obtener todos los PRs abiertos
   */
  async listPullRequestsByReviewer(
    installationId: string,
    owner: string,
    repo: string,
    reviewer: string
  ): Promise<GitHubPullRequest[]> {
    const allPRs = await this.listAllOpenPullRequests(installationId, owner, repo)

    // Filtrar PRs donde el reviewer está en requested_reviewers
    return allPRs.filter(pr => {
      const reviewers = pr.requested_reviewers || []
      return reviewers.some(r => r.login.toLowerCase() === reviewer.toLowerCase())
    })
  }

  /**
   * Obtiene información de un repositorio
   */
  async getRepository(
    installationId: string,
    owner: string,
    repo: string
  ): Promise<{
    id: number
    name: string
    full_name: string
    owner: { login: string }
    default_branch: string
    private: boolean
  }> {
    const url = `/repos/${owner}/${repo}`
    
    const response = await this.request(
      installationId,
      'GET',
      url
    ) as {
      id: number
      name: string
      full_name: string
      owner: { login: string }
      default_branch: string
      private: boolean
    }

    return response
  }

  /**
   * Lista todos los repositorios de una instalación
   * Útil para el scheduler que necesita iterar sobre todos los repos
   */
  async listRepositories(
    installationId: string,
    options?: {
      perPage?: number
      page?: number
    }
  ): Promise<Array<{
    id: number
    name: string
    full_name: string
    owner: { login: string; type: string }
    default_branch: string
    private: boolean
  }>> {
    const perPage = Math.min(options?.perPage || 30, 100)
    const page = options?.page || 1

    const url = `/installation/repositories?per_page=${perPage}&page=${page}`
    
    const response = await this.request(
      installationId,
      'GET',
      url
    ) as {
      repositories: Array<{
        id: number
        name: string
        full_name: string
        owner: { login: string; type: string }
        default_branch: string
        private: boolean
      }>
    }

    return response.repositories
  }

  /**
   * Lista todos los repositorios de una instalación (con paginación automática)
   */
  async listAllRepositories(
    installationId: string
  ): Promise<Array<{
    id: number
    name: string
    full_name: string
    owner: { login: string; type: string }
    default_branch: string
    private: boolean
  }>> {
    const allRepos: Array<{
      id: number
      name: string
      full_name: string
      owner: { login: string; type: string }
      default_branch: string
      private: boolean
    }> = []
    let page = 1
    const perPage = 100

    while (true) {
      const repos = await this.listRepositories(installationId, {
        perPage,
        page,
      })

      if (repos.length === 0) {
        break
      }

      allRepos.push(...repos)

      if (repos.length < perPage) {
        break
      }

      page++
    }

    return allRepos
  }

  /**
   * Obtiene las reviews de un PR
   * Retorna array de reviews con información del reviewer y estado
   */
  async getPullRequestReviews(
    installationId: string,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<Array<{
    id: number
    user: { login: string }
    state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED'
    submitted_at: string
  }>> {
    const url = `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`
    
    const response = await this.request(
      installationId,
      'GET',
      url
    ) as Array<{
      id: number
      user: { login: string }
      state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED'
      submitted_at: string
    }>

    return response
  }

  /**
   * Verifica si un reviewer ya entregó su review (APPROVED o CHANGES_REQUESTED)
   * Retorna true si el reviewer ya tiene un review activo (no DISMISSED)
   */
  async hasReviewerSubmittedReview(
    installationId: string,
    owner: string,
    repo: string,
    prNumber: number,
    reviewerLogin: string
  ): Promise<boolean> {
    try {
      const reviews = await this.getPullRequestReviews(installationId, owner, repo, prNumber)
      
      // Buscar reviews del reviewer que no estén DISMISSED
      const reviewerReviews = reviews.filter(
        review => 
          review.user.login.toLowerCase() === reviewerLogin.toLowerCase() &&
          review.state !== 'DISMISSED'
      )

      // Si tiene algún review activo (APPROVED, CHANGES_REQUESTED, o COMMENTED), ya entregó
      return reviewerReviews.length > 0
    } catch (error) {
      logger.error(
        { error, owner, repo, prNumber, reviewerLogin },
        'Failed to check if reviewer submitted review, assuming not submitted'
      )
      // Si hay error, asumimos que no entregó (para no perder el reminder)
      return false
    }
  }
}
