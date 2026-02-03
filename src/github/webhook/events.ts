import { logger } from '../../utils/logger.js'
import { GlobalConfig } from '../../config/global.js'
import { GitHubClient } from '../client.js'
import { loadRepositoryConfig } from '../../config/repository.js'
import { createAssignmentEngine } from '../../assignment/index.js'
import { NotificationEngine } from '../../notifications/engine.js'
import { formatNewPRMessage } from '../../notifications/slack/messages.js'
import { getNotificationTracker } from '../../notifications/tracker.js'

/**
 * Acciones de pull_request que procesamos
 */
const PROCESSED_PR_ACTIONS = ['opened'] as const

/**
 * Acciones de pull_request que ignoramos (no necesitan procesamiento)
 */
const IGNORED_PR_ACTIONS = [
  'synchronize',        // Push a la branch del PR
  'edited',            // Edición del título/descripción
  'closed',            // PR cerrado (manejado por otros eventos si es necesario)
  'reopened',          // PR reabierto
  'assigned',          // Asignación manual
  'unassigned',        // Desasignación manual
  'labeled',           // Agregar label
  'unlabeled',         // Quitar label
  'locked',            // PR bloqueado
  'unlocked',          // PR desbloqueado
  'ready_for_review',  // PR listo para revisión
  'converted_to_draft', // PR convertido a draft
  'review_requested',  // Reviewer asignado (evita loop cuando nosotros asignamos)
  'review_request_removed', // Reviewer removido
] as const

export async function processWebhookEvent(
  event: string,
  payload: unknown,
  config: GlobalConfig,
  deliveryId?: string
) {
  logger.info({ event, deliveryId }, 'Processing webhook event')

  if (event === 'pull_request') {
    const prEvent = payload as {
      action: string
      sender?: { login: string; type: string }
      installation?: { id: number }
      repository?: { owner: { login: string }; name: string; full_name: string }
      pull_request?: {
        number: number
        title: string
        user: { login: string }
        html_url: string
        body: string | null
        labels: Array<{ name: string }>
        requested_reviewers?: Array<{ login: string }>
      }
    }

    const action = prEvent.action

    // Ignorar acciones que no procesamos
    if (IGNORED_PR_ACTIONS.includes(action as typeof IGNORED_PR_ACTIONS[number])) {
      logger.debug({ action, prNumber: prEvent.pull_request?.number }, 'Ignoring PR action')
      return
    }

    // Procesar solo acciones específicas
    if (PROCESSED_PR_ACTIONS.includes(action as typeof PROCESSED_PR_ACTIONS[number])) {
      // Verificar que no sea un evento generado por nosotros mismos
      // (para evitar loops infinitos)
      const sender = prEvent.sender
      if (sender?.type === 'Bot' || sender?.login?.includes('[bot]')) {
        logger.debug({ 
          action, 
          sender: sender.login,
          prNumber: prEvent.pull_request?.number 
        }, 'Ignoring PR action from bot (likely our own action)')
        return
      }

      if (action === 'opened') {
        await handlePullRequestOpened(prEvent, config, deliveryId)
      }
    } else {
      // Acción desconocida - loguear pero no procesar
      logger.debug({ action, prNumber: prEvent.pull_request?.number }, 'Unknown PR action, ignoring')
    }
  } else if (event === 'pull_request_review') {
    // Por ahora ignoramos eventos de review (futuro: reminders, etc.)
    logger.debug({ event }, 'Ignoring pull_request_review event (not implemented)')
  } else {
    // Otros eventos (issues, push, etc.) - ignorar por ahora
    logger.debug({ event }, 'Ignoring webhook event (not implemented)')
  }
}

async function handlePullRequestOpened(
  payload: {
    installation?: { id: number }
    repository?: { owner: { login: string }; name: string; full_name: string }
      pull_request?: {
        number: number
        title: string
        user: { login: string }
        html_url: string
        body: string | null
        labels: Array<{ name: string }>
        requested_reviewers?: Array<{ login: string }>
        assignees?: Array<{ login: string }>
        base?: { ref: string }
      }
  },
  config: GlobalConfig,
  deliveryId?: string
) {
  if (!payload.installation?.id || !payload.repository || !payload.pull_request) {
    logger.warn({ payload }, 'Missing required fields in PR opened event')
    return
  }

  const installationId = payload.installation.id.toString()
  const owner = payload.repository.owner.login
  const repo = payload.repository.name
  const pr = payload.pull_request

  logger.info(
    { installationId, owner, repo, prNumber: pr.number },
    'Handling pull_request.opened event'
  )

  try {
    // 1. Cargar configuración del repositorio desde la branch base del PR
    // Esto asegura que usamos la configuración establecida en la branch principal,
    // no cambios experimentales que puedan estar en la branch del PR
    const baseBranch = pr.base?.ref || 'dev' // Fallback a 'dev' si no está disponible

    logger.debug({ 
      baseBranch,
      prNumber: pr.number
    }, 'Loading config from base branch (team members are read from this branch)')
    
    const githubClient = new GitHubClient(config)
    const configContent = await githubClient.getFileContent(
      installationId,
      owner,
      repo,
      '.pr-sheriff.yml',
      baseBranch // Especificar la branch base
    )

    logger.debug({ 
      configLength: configContent.length,
      configPreview: configContent.substring(0, 200)
    }, 'Loaded repository config file')
    
    const repoConfig = await loadRepositoryConfig(configContent)
    
    logger.debug({ 
      teamName: repoConfig.team.name,
      membersCount: repoConfig.team.members.length,
      members: repoConfig.team.members.map(m => m.github)
    }, 'Parsed repository config')

    // 2. Asignar revisores si está habilitado
    if (repoConfig.github.auto_assign.enabled) {
      logger.debug({ prNumber: pr.number }, 'Auto-assign is enabled, selecting reviewers')
      
      // Construir repositoryId para persistencia (formato: `${installationId}/${owner}/${repo}`)
      const repositoryId = `${installationId}/${owner}/${repo}`
      
      const assignmentEngine = createAssignmentEngine()
      
      // Usar versión con persistencia si está disponible (para round-robin y least-busy)
      let selectedReviewers
      try {
        selectedReviewers = await assignmentEngine.assignReviewersWithPersistence(
          repoConfig.team.members,
          {
            number: pr.number,
            author: pr.user.login,
            reviewers: pr.requested_reviewers?.map(r => r.login),
          },
          repoConfig,
          repositoryId,
          githubClient, // Para least-busy
          installationId, // Para least-busy
          owner, // Para least-busy
          repo // Para least-busy
        )
      } catch (error) {
        // Fallback a versión síncrona si hay error
        logger.warn({ error, repositoryId }, 'Failed to use persistent assignment, falling back to sync')
        selectedReviewers = assignmentEngine.assignReviewers(
          repoConfig.team.members,
          {
            number: pr.number,
            author: pr.user.login,
            reviewers: pr.requested_reviewers?.map(r => r.login),
          },
          repoConfig
        )
      }

      logger.debug({ 
        prNumber: pr.number, 
        selectedCount: selectedReviewers.length,
        selected: selectedReviewers.map(r => r.github)
      }, 'Selected reviewers from assignment engine')

      if (selectedReviewers.length > 0) {
        // Verificar si ya hay reviewers asignados para evitar re-asignaciones innecesarias
        const existingReviewers = pr.requested_reviewers?.map(r => r.login) || []
        const newReviewers = selectedReviewers
          .map(r => r.github)
          .filter(login => !existingReviewers.includes(login))
        
        if (newReviewers.length === 0) {
          logger.debug({ 
            prNumber: pr.number, 
            existingReviewers 
          }, 'All selected reviewers already assigned, skipping assignment')
        } else {
          // Asignar solo los nuevos revisores
          try {
            await githubClient.request(
              installationId,
              'POST',
              `/repos/${owner}/${repo}/pulls/${pr.number}/requested_reviewers`,
              { reviewers: newReviewers }
            )

            logger.info({ 
              prNumber: pr.number, 
              reviewers: newReviewers,
              totalReviewers: [...existingReviewers, ...newReviewers]
            }, 'Assigned reviewers to PR')
            
            // Actualizar los reviewers del PR para la notificación
            pr.requested_reviewers = [...existingReviewers, ...newReviewers].map(login => ({ login }))
          } catch (error) {
            logger.error({ error, prNumber: pr.number, reviewers: newReviewers }, 'Failed to assign reviewers')
          }
        }
      } else {
        logger.warn({ prNumber: pr.number }, 'No reviewers selected for assignment')
      }
    } else {
      logger.debug({ prNumber: pr.number }, 'Auto-assign is disabled')
    }

    // 3. Notificar en Slack si está habilitado
    if (repoConfig.notifications.new_pr_notifications.enabled) {
      const channel = repoConfig.notifications.new_pr_notifications.channel
      const tracker = getNotificationTracker()

      // Verificar si ya enviamos esta notificación (evitar duplicados)
      const wasAlreadySent = await tracker.checkAndMark(
        'new_pr',
        deliveryId,
        undefined, // prId no disponible aún (podríamos construirlo si lo necesitamos)
        channel,
        {
          reviewers: pr.requested_reviewers?.map(r => r.login),
          labels: pr.labels.map(l => l.name),
          author: pr.user.login,
          title: pr.title,
        }
      )

      if (wasAlreadySent) {
        logger.info({ prNumber: pr.number, deliveryId }, 'Notification already sent, skipping')
        return
      }

      // Mapear los reviewers asignados a sus Slack IDs
      const reviewerSlackIds =
        pr.requested_reviewers?.map(githubUsername => {
          const member = repoConfig.team.members.find(
            m => m.github === githubUsername.login
          )
          return member?.slack
        }).filter((id): id is string => !!id) || []

      // Mapear los assignees a sus Slack IDs
      const assigneeSlackIds =
        pr.assignees?.map(githubUsername => {
          const member = repoConfig.team.members.find(
            m => m.github === githubUsername.login
          )
          return member?.slack
        }).filter((id): id is string => !!id) || []

      const notificationEngine = new NotificationEngine(config)
      const message = formatNewPRMessage(
        {
          number: pr.number,
          title: pr.title,
          author: pr.user.login,
          url: pr.html_url,
          reviewers: pr.requested_reviewers?.map(r => r.login),
          reviewerSlackIds, // Pasar los Slack IDs para menciones
          assignees: pr.assignees?.map(a => a.login),
          assigneeSlackIds, // Pasar los Slack IDs para menciones
          description: pr.body || undefined,
          labels: pr.labels.map(l => l.name),
        },
        repoConfig
      )

      await notificationEngine.send(message)
      logger.info({ prNumber: pr.number, deliveryId }, 'Sent Slack notification')
    }
  } catch (error) {
    logger.error({ error, prNumber: pr.number }, 'Error handling PR opened event')
  }
}
