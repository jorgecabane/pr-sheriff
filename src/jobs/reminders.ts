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
 * Datos acumulados por reviewer (across repos)
 */
interface ReviewerData {
  slackId?: string  // Si está en algún repo del equipo
  prs: Array<{
    pr: GitHubPullRequest
    owner: string
    repo: string
    installationId: string
  }>
  repos: Set<string>  // Para tracking: `${owner}/${repo}`
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

    // 2. Acumular PRs por reviewer (across repos)
    // Map<reviewerLogin, ReviewerData>
    const reviewersData = new Map<string, ReviewerData>()

    logger.debug(
      { installationsCount: dbInstallations.length, installationIds: dbInstallations.map(i => i.id) },
      'Installations to process'
    )

    // 3. Para cada instalación, procesar sus repositorios y acumular datos
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
            logger.debug(
              { installationId, reposCount: githubRepos.length, repos: githubRepos.map(r => r.full_name) },
              'Repositories to process from GitHub'
            )
            
            for (const repo of githubRepos) {
              const [owner, name] = repo.full_name.split('/')
              logger.debug({ owner, name, installationId }, 'Processing repository from GitHub')
              await processRepository(
                githubClient,
                installationId,
                owner,
                name,
                reviewersData
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
          logger.debug(
            { installationId, reposCount: dbRepos.length, repos: dbRepos.map(r => r.fullName) },
            'Repositories to process from database'
          )
          for (const repo of dbRepos) {
            const [owner, name] = repo.fullName.split('/')
            await processRepository(
              githubClient,
              installationId,
              owner,
              name,
              reviewersData
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

    // 4. Al final, enviar DMs a cada reviewer con todos sus PRs (verificando reviews)
    logger.info({ reviewersCount: reviewersData.size }, 'Sending reminders to reviewers')
    await sendRemindersToReviewers(
      githubClient,
      notificationEngine,
      tracker,
      reviewersData,
      result
    )

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
 * Procesa un repositorio: carga config, consulta PRs, agrupa por reviewer y acumula datos
 * NO envía DMs aquí, solo acumula para enviar después
 */
async function processRepository(
  githubClient: GitHubClient,
  installationId: string,
  owner: string,
  repo: string,
  reviewersData: Map<string, ReviewerData>
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

      // Agrupar por cada reviewer asignado (incluyendo externos)
      const reviewers = pr.requested_reviewers || []
      for (const reviewer of reviewers) {
        const reviewerLogin = reviewer.login.toLowerCase()
        
        // Buscar si el reviewer está en el equipo configurado
        const teamMember = repoConfig.team.members.find(
          m => m.github.toLowerCase() === reviewerLogin
        )

        // Inicializar datos del reviewer si no existe
        if (!reviewersData.has(reviewerLogin)) {
          reviewersData.set(reviewerLogin, {
            slackId: teamMember?.slack,
            prs: [],
            repos: new Set(),
          })
        }

        const reviewerData = reviewersData.get(reviewerLogin)!

        // Si encontramos Slack ID en este repo y no lo teníamos, actualizarlo
        if (teamMember?.slack && !reviewerData.slackId) {
          reviewerData.slackId = teamMember.slack
        }

        // No agregar el mismo PR dos veces (p. ej. si el repo se procesa por dos instalaciones)
        const prKey = `${owner}/${repo}#${pr.number}`
        const alreadyHas = reviewerData.prs.some(
          p => `${p.owner}/${p.repo}#${p.pr.number}` === prKey
        )
        if (alreadyHas) {
          logger.debug(
            { reviewerLogin, owner, repo, prNumber: pr.number },
            'PR already in reviewer list, skipping duplicate'
          )
          reviewerData.repos.add(`${owner}/${repo}`)
          continue
        }

        // Agregar PR a la lista del reviewer
        logger.debug(
          { reviewerLogin, owner, repo, prNumber: pr.number },
          'PR added to reviewer list'
        )
        reviewerData.prs.push({
          pr,
          owner,
          repo,
          installationId,
        })
        reviewerData.repos.add(`${owner}/${repo}`)
      }
    }
  } catch (error) {
    logger.error({ error, owner, repo }, 'Error processing repository for reminders')
    // No agregar a result.errors aquí, se maneja en el nivel superior
  }
}

/**
 * Envía reminders a cada reviewer con todos sus PRs (verificando reviews primero).
 */
async function sendRemindersToReviewers(
  githubClient: GitHubClient,
  notificationEngine: NotificationEngine,
  tracker: ReturnType<typeof getNotificationTracker>,
  reviewersData: Map<string, ReviewerData>,
  result: ReminderResult
): Promise<void> {
  for (const [reviewerLogin, reviewerData] of reviewersData.entries()) {
    if (reviewerData.prs.length === 0) {
      continue
    }

    // Filtrar PRs donde el reviewer ya entregó su review
    const pendingPRs: typeof reviewerData.prs = []

    for (const { pr, owner, repo, installationId } of reviewerData.prs) {
      const hasSubmittedReview = await githubClient.hasReviewerSubmittedReview(
        installationId,
        owner,
        repo,
        pr.number,
        reviewerLogin
      )

      if (!hasSubmittedReview) {
        pendingPRs.push({ pr, owner, repo, installationId })
      } else {
        logger.debug(
          { reviewerLogin, owner, repo, prNumber: pr.number },
          'Reviewer already submitted review, skipping PR from reminder'
        )
      }
    }

    if (pendingPRs.length === 0) {
      logger.debug({ reviewerLogin }, 'No pending PRs after filtering reviews, skipping reminder')
      continue
    }

    const slackUserId = reviewerData.slackId

    if (slackUserId) {
      await sendDMReminder(
        notificationEngine,
        tracker,
        reviewerLogin,
        slackUserId,
        pendingPRs,
        result
      )
    } else {
      await sendChannelReminder(
        githubClient,
        notificationEngine,
        tracker,
        reviewerLogin,
        pendingPRs,
        reviewerData.repos,
        result
      )
    }
  }
}

/**
 * Envía reminder por DM a un reviewer del equipo
 */
async function sendDMReminder(
  notificationEngine: NotificationEngine,
  tracker: ReturnType<typeof getNotificationTracker>,
  reviewerLogin: string,
  slackUserId: string,
  pendingPRs: Array<{ pr: GitHubPullRequest; owner: string; repo: string; installationId: string }>,
  result: ReminderResult
): Promise<void> {
  const reminderId = `reviewer/${reviewerLogin}`
  
  // Verificar si ya enviamos reminder hoy
  const wasAlreadySent = await tracker.checkAndMark(
    'reminder',
    undefined,
    reminderId,
    slackUserId,
    {
      reviewers: [reviewerLogin],
      prCount: pendingPRs.length,
      repositories: Array.from(new Set(pendingPRs.map(({ owner, repo }) => `${owner}/${repo}`))),
      prNumbers: pendingPRs.map(({ pr }) => pr.number),
    }
  )

  if (wasAlreadySent) {
    logger.debug({ reviewerLogin }, 'Reminder already sent today, skipping')
    return
  }

  // Convertir PRs a formato PRInfo para el mensaje (incluyendo información del repositorio)
  const prInfos = pendingPRs.map(({ pr, owner, repo }) => ({
    number: pr.number,
    title: pr.title,
    author: pr.user.login,
    url: pr.html_url,
    labels: pr.labels.map(l => l.name),
    repository: `${owner}/${repo}`, // Agregar información del repositorio para agrupar
  }))

  // Enviar DM
  try {
    const message = formatReminderMessage(prInfos, slackUserId)
    await notificationEngine.send(message)
    result.reviewersNotified++
    result.totalPRs += pendingPRs.length

    logger.info({
      reviewer: reviewerLogin,
      prCount: pendingPRs.length,
      repositories: Array.from(new Set(pendingPRs.map(({ owner, repo }) => `${owner}/${repo}`))),
    }, 'Sent reminder DM')
  } catch (error) {
    logger.error({ error, reviewer: reviewerLogin }, 'Failed to send reminder DM')
    result.errors.push({
      repository: `reviewer:${reviewerLogin}`,
      error: `Failed to send reminder: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

/**
 * Envía reminder al canal taggeando a un reviewer externo
 */
async function sendChannelReminder(
  githubClient: GitHubClient,
  notificationEngine: NotificationEngine,
  tracker: ReturnType<typeof getNotificationTracker>,
  reviewerLogin: string,
  pendingPRs: Array<{ pr: GitHubPullRequest; owner: string; repo: string; installationId: string }>,
  repos: Set<string>,
  result: ReminderResult
): Promise<void> {
  // Intentar obtener el canal del primer repo donde aparece
  // Necesitamos cargar la config de algún repo para obtener el canal
  let channel: string | undefined

  for (const repoFullName of repos) {
    try {
      const [owner, repo] = repoFullName.split('/')
      const firstPR = pendingPRs.find(p => p.owner === owner && p.repo === repo)
      if (!firstPR) continue

      const configContent = await githubClient.getFileContent(
        firstPR.installationId,
        owner,
        repo,
        '.pr-sheriff.yml'
      )
      const { loadRepositoryConfig } = await import('../config/repository.js')
      const repoConfig = await loadRepositoryConfig(configContent)
      
      if (repoConfig.notifications.new_pr_notifications.enabled) {
        channel = repoConfig.notifications.new_pr_notifications.channel
        break
      }
    } catch (error) {
      logger.debug({ error, repo: repoFullName }, 'Failed to load config for channel, trying next repo')
      continue
    }
  }

  if (!channel) {
    logger.warn({ reviewerLogin }, 'No channel found for external reviewer, skipping reminder')
    result.errors.push({
      repository: `reviewer:${reviewerLogin}`,
      error: 'No channel configured in any repository for external reviewer',
    })
    return
  }

  // Para reminders en canal, usamos un ID único por reviewer+día
  const reminderId = `reviewer/${reviewerLogin}/channel`
  
  // Verificar si ya enviamos reminder hoy
  const wasAlreadySent = await tracker.checkAndMark(
    'reminder',
    undefined,
    reminderId,
    channel,
    {
      reviewers: [reviewerLogin],
      prCount: pendingPRs.length,
      repositories: Array.from(repos),
      prNumbers: pendingPRs.map(({ pr }) => pr.number),
    }
  )

  if (wasAlreadySent) {
    logger.debug({ reviewerLogin, channel }, 'Channel reminder already sent today, skipping')
    return
  }

  // Crear mensaje para el canal taggeando al reviewer
  const prInfos = pendingPRs.map(({ pr }) => ({
    number: pr.number,
    title: pr.title,
    author: pr.user.login,
    url: pr.html_url,
    labels: pr.labels.map(l => l.name),
  }))

  // Formatear mensaje para canal usando blocks (taggeando con @username de GitHub)
  const blocks: unknown[] = []

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `🔔 Recordatorio: @${reviewerLogin} tiene ${pendingPRs.length} PR${pendingPRs.length > 1 ? 's' : ''} pendiente${pendingPRs.length > 1 ? 's' : ''} de revisar`,
      emoji: true,
    },
  })

  // Lista de PRs
  for (const pr of prInfos) {
    const fields: Array<{ type: string; text: string }> = [
      {
        type: 'mrkdwn',
        text: `*PR:* <${pr.url}|#${pr.number}: ${pr.title}>`,
      },
      {
        type: 'mrkdwn',
        text: `*Autor:* @${pr.author}`,
      },
    ]

    if (pr.labels && pr.labels.length > 0) {
      fields.push({
        type: 'mrkdwn',
        text: `*Etiquetas:* ${pr.labels.map(l => `\`${l}\``).join(', ')}`,
      })
    }

    blocks.push({
      type: 'section',
      fields,
    })

    // Botón para ver el PR
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Ver PR',
            emoji: true,
          },
          url: pr.url,
          style: 'primary',
        },
      ],
    })
  }

  const message = {
    channel,
    text: `🔔 Recordatorio: @${reviewerLogin} tiene ${pendingPRs.length} PR${pendingPRs.length > 1 ? 's' : ''} pendiente${pendingPRs.length > 1 ? 's' : ''} de revisar`,
    blocks,
  }

  try {
    await notificationEngine.send(message)
    result.reviewersNotified++
    result.totalPRs += pendingPRs.length

    logger.info({
      reviewer: reviewerLogin,
      channel,
      prCount: pendingPRs.length,
      repositories: Array.from(repos),
    }, 'Sent reminder to channel for external reviewer')
  } catch (error) {
    logger.error({ error, reviewer: reviewerLogin, channel }, 'Failed to send channel reminder')
    result.errors.push({
      repository: `reviewer:${reviewerLogin}`,
      error: `Failed to send channel reminder: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
