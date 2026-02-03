import { GitHubClient, GitHubPullRequest } from '../github/client.js'
import { GlobalConfig } from '../config/global.js'
import { loadRepositoryConfig } from '../config/repository.js'
import { NotificationEngine } from '../notifications/engine.js'
import { formatBlameMessage } from '../notifications/slack/messages.js'
import { getNotificationTracker } from '../notifications/tracker.js'
import { logger } from '../utils/logger.js'
import { getDatabase, isDatabaseAvailable } from '../db/client.js'
import { installations, repositories } from '../db/schema.js'
import { eq } from 'drizzle-orm'

export interface BlameResult {
  prsBlamed: number
  repositoriesProcessed: number
  errors: Array<{ repository: string; error: string }>
}

/**
 * Calcula los días desde una fecha hasta ahora
 */
function daysSince(date: Date): number {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

/**
 * Ejecuta el job de blame para PRs antiguos
 * Consulta PRs abiertos, filtra los que tienen más de X días y envía mensaje al canal
 */
export async function runBlameJob(config: GlobalConfig): Promise<BlameResult> {
  const result: BlameResult = {
    prsBlamed: 0,
    repositoriesProcessed: 0,
    errors: [],
  }

  try {
    const githubClient = new GitHubClient(config)
    const notificationEngine = new NotificationEngine(config)
    const tracker = getNotificationTracker()

    // 1. Obtener instalaciones: PRIMERO desde env var (más rápido y confiable), sino desde DB
    let dbInstallations: Array<{ id: string; accountId: string; accountType: string; createdAt: Date; updatedAt: Date }> = []

    // Prioridad 1: Variable de entorno (más rápido y confiable)
    const installationIdFromEnv = process.env.GITHUB_INSTALLATION_ID
    
    if (installationIdFromEnv) {
      logger.info({ installationId: installationIdFromEnv }, 'Using installation ID from environment variable (GITHUB_INSTALLATION_ID)')
      dbInstallations = [{
        id: installationIdFromEnv,
        accountId: 'unknown',
        accountType: 'User',
        createdAt: new Date(),
        updatedAt: new Date(),
      }]
    } else {
      // Prioridad 2: Base de datos (solo si no hay env var)
      if (isDatabaseAvailable()) {
        try {
          const db = getDatabase()
          dbInstallations = await db.select().from(installations)
          logger.debug({ count: dbInstallations.length }, 'Loaded installations from database')
        } catch (error) {
          logger.warn({ error }, 'Failed to load installations from database')
        }
      }

      // Si no hay instalaciones en ningún lado, retornar error
      if (dbInstallations.length === 0) {
        logger.warn('No installations found. GITHUB_INSTALLATION_ID not set and database is empty or unavailable.')
        logger.info('Tip: Set GITHUB_INSTALLATION_ID env var or ensure webhooks are being received to populate installations.')
        return result
      }
    }

    // 2. Para cada instalación, procesar sus repositorios
    for (const installation of dbInstallations) {
      try {
        const installationId = installation.id

        // Obtener repositorios: desde DB si está disponible, sino desde GitHub
        let dbRepos: Array<{ id: string; installationId: string; owner: string; name: string; fullName: string; defaultBranch: string; configHash: string | null; createdAt: Date; updatedAt: Date }> = []

        if (isDatabaseAvailable()) {
          try {
            const db = getDatabase()
            dbRepos = await db
              .select()
              .from(repositories)
              .where(eq(repositories.installationId, installationId))
            logger.debug({ installationId, count: dbRepos.length }, 'Loaded repositories from database')
          } catch (error) {
            logger.warn({ error, installationId }, 'Failed to load repositories from database, fetching from GitHub')
          }
        }

        // Si no hay repos en la DB, obtenerlos desde GitHub directamente
        if (dbRepos.length === 0) {
          logger.info({ installationId }, 'No repositories found in DB, fetching from GitHub')
          
          try {
            const githubRepos = await githubClient.listAllRepositories(installationId)
            logger.info({ installationId, repoCount: githubRepos.length }, 'Fetched repositories from GitHub')
            
            for (const repo of githubRepos) {
              const [owner, name] = repo.full_name.split('/')
              logger.debug({ owner, name, installationId }, 'Processing repository from GitHub')
              await processRepository(
                githubClient,
                notificationEngine,
                tracker,
                installationId,
                owner,
                name,
                result
              )
            }
          } catch (error) {
            logger.error({ error, installationId }, 'Failed to fetch repositories from GitHub')
            result.errors.push({
              repository: `installation:${installationId}`,
              error: `Failed to fetch repos: ${error instanceof Error ? error.message : String(error)}`,
            })
          }
        } else {
          // Procesar repos desde la DB
          for (const repo of dbRepos) {
            const [owner, name] = repo.fullName.split('/')
            await processRepository(
              githubClient,
              notificationEngine,
              tracker,
              installationId,
              owner,
              name,
              result
            )
          }
        }
      } catch (error) {
        logger.error({ error, installationId: installation.id }, 'Error processing installation')
        result.errors.push({
          repository: `installation:${installation.id}`,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    logger.info({
      prsBlamed: result.prsBlamed,
      repositoriesProcessed: result.repositoriesProcessed,
      errors: result.errors.length,
    }, 'Blame job completed')

    return result
  } catch (error) {
    logger.error({ error }, 'Fatal error in blame job')
    throw error
  }
}

/**
 * Procesa un repositorio: carga config, consulta PRs, filtra antiguos y envía mensaje
 */
async function processRepository(
  githubClient: GitHubClient,
  notificationEngine: NotificationEngine,
  tracker: ReturnType<typeof getNotificationTracker>,
  installationId: string,
  owner: string,
  repo: string,
  result: BlameResult
): Promise<void> {
  try {
    // 1. Cargar configuración del repositorio
    let repoConfig
    try {
      logger.debug({ owner, repo, installationId }, 'Loading .pr-sheriff.yml')
      const configContent = await githubClient.getFileContent(
        installationId,
        owner,
        repo,
        '.pr-sheriff.yml'
      )
      repoConfig = await loadRepositoryConfig(configContent)
      logger.debug({ owner, repo, teamName: repoConfig.team.name }, 'Loaded repository config')
    } catch (error) {
      // Si no hay .pr-sheriff.yml, saltar este repo
      logger.debug({ owner, repo, error: error instanceof Error ? error.message : String(error) }, 'No .pr-sheriff.yml found or error loading config, skipping')
      return
    }

    // Verificar si blame está habilitado
    if (!repoConfig.notifications.blame.enabled) {
      logger.debug({ owner, repo }, 'Blame disabled for repository')
      return
    }

    const afterDays = repoConfig.notifications.blame.after_days
    const channel = repoConfig.notifications.blame.channel

    // 2. Consultar PRs abiertos
    logger.debug({ owner, repo, installationId }, 'Fetching open PRs')
    const openPRs = await githubClient.listAllOpenPullRequests(installationId, owner, repo)
    logger.info({ owner, repo, prCount: openPRs.length }, 'Found open PRs')

    if (openPRs.length === 0) {
      logger.debug({ owner, repo }, 'No open PRs found')
      return
    }

    // 3. Filtrar PRs antiguos (más de X días)
    const oldPRs: GitHubPullRequest[] = []

    for (const pr of openPRs) {
      // Filtrar PRs draft si está configurado
      if (pr.draft && repoConfig.rules.exclude_labels?.includes('draft')) {
        continue
      }

      // Filtrar por labels excluidas
      const hasExcludedLabel = pr.labels.some(label =>
        repoConfig.rules.exclude_labels?.includes(label.name)
      )
      if (hasExcludedLabel) {
        continue
      }

      // Filtrar por labels incluidos (si está configurado y no está vacío)
      const includeLabels = repoConfig.rules.include_labels || []
      if (includeLabels.length > 0) {
        const hasIncludedLabel = pr.labels.some(label =>
          includeLabels.includes(label.name)
        )
        if (!hasIncludedLabel) {
          logger.debug({ prNumber: pr.number, labels: pr.labels.map(l => l.name), includeLabels }, 'PR does not have any required include_labels, skipping')
          continue
        }
      }

      // Calcular días desde creación o última actualización
      const createdAt = new Date(pr.created_at)
      const updatedAt = new Date(pr.updated_at)
      
      // Usar la fecha más reciente entre created_at y updated_at
      // Si el PR fue actualizado recientemente, no es tan "antiguo"
      const daysSinceCreation = daysSince(createdAt)
      const daysSinceUpdate = daysSince(updatedAt)
      
      // Considerar "antiguo" si tiene más de X días desde creación
      // Y no ha sido actualizado en los últimos X días
      if (daysSinceCreation >= afterDays && daysSinceUpdate >= afterDays) {
        oldPRs.push(pr)
        logger.debug({
          owner,
          repo,
          prNumber: pr.number,
          daysSinceCreation,
          daysSinceUpdate,
          afterDays,
        }, 'PR is old enough to blame')
      }
    }

    if (oldPRs.length === 0) {
      logger.debug({ owner, repo }, 'No old PRs found')
      return
    }

    logger.info({ owner, repo, oldPRCount: oldPRs.length, afterDays }, 'Found old PRs to blame')

    // 4. Verificar si ya enviamos blame hoy (usar repo como key)
    const blameId = `${owner}/${repo}/blame`
    const wasAlreadySent = await tracker.checkAndMark(
      'blame',
      undefined, // No hay deliveryId para blame
      blameId,
      channel,
      {
        prCount: oldPRs.length,
        repository: `${owner}/${repo}`,
        afterDays,
      }
    )

    if (wasAlreadySent) {
      logger.debug({ owner, repo }, 'Blame already sent today, skipping')
      return
    }

    // 5. Convertir PRs a formato PRInfo y mapear Slack IDs de reviewers
    const prInfos = oldPRs.map(pr => {
      const reviewers = pr.requested_reviewers?.map(r => r.login) || []
      const reviewerSlackIds = reviewers
        .map(githubUsername => {
          const member = repoConfig.team.members.find(
            m => m.github.toLowerCase() === githubUsername.toLowerCase()
          )
          return member?.slack
        })
        .filter((id): id is string => !!id)

      return {
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        url: pr.html_url,
        reviewers,
        reviewerSlackIds,
        labels: pr.labels.map(l => l.name),
      }
    })

    // 6. Enviar mensaje al canal
    try {
      const message = formatBlameMessage(prInfos, afterDays, channel)
      await notificationEngine.send(message)
      
      result.prsBlamed += oldPRs.length
      result.repositoriesProcessed++

      logger.info({
        owner,
        repo,
        prCount: oldPRs.length,
        channel,
      }, 'Sent blame message to channel')
    } catch (error) {
      logger.error(
        { error, owner, repo, channel },
        'Failed to send blame message'
      )
      result.errors.push({
        repository: `${owner}/${repo}`,
        error: `Failed to send blame: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  } catch (error) {
    logger.error({ error, owner, repo }, 'Error processing repository for blame')
    result.errors.push({
      repository: `${owner}/${repo}`,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
