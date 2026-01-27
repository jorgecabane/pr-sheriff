import { logger } from '../../utils/logger.js'
import { GlobalConfig } from '../../config/global.js'
import { GitHubClient } from '../client.js'
import { loadRepositoryConfig } from '../../config/repository.js'
import { createAssignmentEngine } from '../../assignment/index.js'
import { NotificationEngine } from '../../notifications/engine.js'
import { formatNewPRMessage } from '../../notifications/slack/messages.js'

export async function processWebhookEvent(
  event: string,
  payload: unknown,
  config: GlobalConfig
) {
  logger.info({ event }, 'Processing webhook event')

  if (event === 'pull_request') {
    const prEvent = payload as {
      action: string
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

    if (prEvent.action === 'opened') {
      await handlePullRequestOpened(prEvent, config)
    }
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
      base?: { ref: string }
    }
  },
  config: GlobalConfig
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
    }, 'Loading config from base branch')
    
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
      
      const assignmentEngine = createAssignmentEngine()
      const selectedReviewers = assignmentEngine.assignReviewers(
        repoConfig.team.members,
        {
          number: pr.number,
          author: pr.user.login,
          reviewers: pr.requested_reviewers?.map(r => r.login),
        },
        repoConfig
      )

      logger.debug({ 
        prNumber: pr.number, 
        selectedCount: selectedReviewers.length,
        selected: selectedReviewers.map(r => r.github)
      }, 'Selected reviewers from assignment engine')

      if (selectedReviewers.length > 0) {
        // Asignar revisores en GitHub
        const reviewers = selectedReviewers.map(r => r.github)
        
        try {
          await githubClient.request(
            installationId,
            'POST',
            `/repos/${owner}/${repo}/pulls/${pr.number}/requested_reviewers`,
            { reviewers }
          )

          logger.info({ prNumber: pr.number, reviewers }, 'Assigned reviewers to PR')
          
          // Actualizar los reviewers del PR para la notificación
          pr.requested_reviewers = reviewers.map(login => ({ login }))
        } catch (error) {
          logger.error({ error, prNumber: pr.number, reviewers }, 'Failed to assign reviewers')
        }
      } else {
        logger.warn({ prNumber: pr.number }, 'No reviewers selected for assignment')
      }
    } else {
      logger.debug({ prNumber: pr.number }, 'Auto-assign is disabled')
    }

    // 3. Notificar en Slack si está habilitado
    if (repoConfig.notifications.new_pr_notifications.enabled) {
      const notificationEngine = new NotificationEngine(config)
      const message = formatNewPRMessage(
        {
          number: pr.number,
          title: pr.title,
          author: pr.user.login,
          url: pr.html_url,
          reviewers: pr.requested_reviewers?.map(r => r.login),
          description: pr.body || undefined,
          labels: pr.labels.map(l => l.name),
        },
        repoConfig
      )

      await notificationEngine.send(message)
      logger.info({ prNumber: pr.number }, 'Sent Slack notification')
    }
  } catch (error) {
    logger.error({ error, prNumber: pr.number }, 'Error handling PR opened event')
  }
}
