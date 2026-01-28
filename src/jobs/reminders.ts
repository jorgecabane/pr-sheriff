import { GitHubClient, GitHubPullRequest } from '../github/client.js'
import { GlobalConfig } from '../config/global.js'
import { loadRepositoryConfig } from '../config/repository.js'
import { NotificationEngine } from '../notifications/engine.js'
import { formatReminderMessage } from '../notifications/slack/messages.js'
import { getNotificationTracker } from '../notifications/tracker.js'
import { logger } from '../utils/logger.js'
import { getDatabase, isDatabaseAvailable } from '../db/client.js'
import { installations, repositories } from '../db/schema.js'
import { eq } from 'drizzle-orm'

export interface ReminderResult {
  reviewersNotified: number
  totalPRs: number
  errors: Array<{ repository: string; error: string }>
}

/**
 * Ejecuta el job de reminders diarios
 * Consulta PRs abiertos, los agrupa por reviewer y envía DMs
 */
export async function runRemindersJob(config: GlobalConfig): Promise<ReminderResult> {
  const result: ReminderResult = {
    reviewersNotified: 0,
    totalPRs: 0,
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
      reviewersNotified: result.reviewersNotified,
      totalPRs: result.totalPRs,
      errors: result.errors.length,
    }, 'Reminders job completed')

    return result
  } catch (error) {
    logger.error({ error }, 'Fatal error in reminders job')
    throw error
  }
}

/**
 * Procesa un repositorio: carga config, consulta PRs, agrupa por reviewer y envía DMs
 */
async function processRepository(
  githubClient: GitHubClient,
  notificationEngine: NotificationEngine,
  tracker: ReturnType<typeof getNotificationTracker>,
  installationId: string,
  owner: string,
  repo: string,
  result: ReminderResult
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

    // Verificar si reminders están habilitados
    if (!repoConfig.notifications.daily_reminders.enabled) {
      logger.debug({ owner, repo }, 'Daily reminders disabled for repository')
      return
    }

    // 2. Consultar PRs abiertos
    logger.debug({ owner, repo, installationId }, 'Fetching open PRs')
    const openPRs = await githubClient.listAllOpenPullRequests(installationId, owner, repo)
    logger.info({ owner, repo, prCount: openPRs.length }, 'Found open PRs')

    if (openPRs.length === 0) {
      logger.debug({ owner, repo }, 'No open PRs found')
      return
    }

    // 3. Agrupar PRs por reviewer
    logger.debug({ owner, repo, prCount: openPRs.length }, 'Grouping PRs by reviewer')
    const prsByReviewer = new Map<string, GitHubPullRequest[]>()

    for (const pr of openPRs) {
      logger.debug({ owner, repo, prNumber: pr.number, reviewers: pr.requested_reviewers?.map(r => r.login) }, 'Processing PR')
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

      // Agrupar por cada reviewer asignado
      const reviewers = pr.requested_reviewers || []
      for (const reviewer of reviewers) {
        const reviewerLogin = reviewer.login.toLowerCase()
        
        // Verificar que el reviewer esté en el equipo configurado
        const teamMember = repoConfig.team.members.find(
          m => m.github.toLowerCase() === reviewerLogin
        )

        if (teamMember) {
          if (!prsByReviewer.has(reviewerLogin)) {
            prsByReviewer.set(reviewerLogin, [])
          }
          prsByReviewer.get(reviewerLogin)!.push(pr)
        }
      }
    }

    // 4. Enviar DMs a cada reviewer
    for (const [reviewerLogin, prs] of prsByReviewer.entries()) {
      if (prs.length === 0) {
        continue
      }

      const teamMember = repoConfig.team.members.find(
        m => m.github.toLowerCase() === reviewerLogin
      )

      if (!teamMember) {
        continue
      }

      const slackUserId = teamMember.slack

      // Para reminders, usamos un ID único por reviewer+repo+día
      // Formato: `${owner}/${repo}/reviewer/${reviewerLogin}`
      // El tracking verifica si ya enviamos hoy usando este ID
      const reminderId = `${owner}/${repo}/reviewer/${reviewerLogin}`
      
      // Verificar si ya enviamos reminder hoy
      const wasAlreadySent = await tracker.checkAndMark(
        'reminder',
        undefined, // No hay deliveryId para reminders
        reminderId, // Usar ID único por reviewer+repo
        slackUserId,
        {
          reviewers: [reviewerLogin],
          prCount: prs.length,
          repository: `${owner}/${repo}`,
          prNumbers: prs.map(pr => pr.number),
        }
      )

      if (wasAlreadySent) {
        logger.debug({ reviewerLogin, repository: `${owner}/${repo}` }, 'Reminder already sent today, skipping')
        continue
      }

      // Convertir PRs de GitHub a formato PRInfo para el mensaje
      const prInfos = prs.map(pr => ({
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        url: pr.html_url,
        labels: pr.labels.map(l => l.name),
      }))

      // Enviar DM
      try {
        const message = formatReminderMessage(
          prInfos,
          slackUserId
        )

        await notificationEngine.send(message)
        result.reviewersNotified++
        result.totalPRs += prs.length

        logger.info({
          reviewer: reviewerLogin,
          repository: `${owner}/${repo}`,
          prCount: prs.length,
        }, 'Sent reminder DM')
      } catch (error) {
        logger.error(
          { error, reviewer: reviewerLogin, repository: `${owner}/${repo}` },
          'Failed to send reminder DM'
        )
        result.errors.push({
          repository: `${owner}/${repo}`,
          error: `Failed to send reminder to ${reviewerLogin}: ${error instanceof Error ? error.message : String(error)}`,
        })
      }
    }
  } catch (error) {
    logger.error({ error, owner, repo }, 'Error processing repository for reminders')
    result.errors.push({
      repository: `${owner}/${repo}`,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
