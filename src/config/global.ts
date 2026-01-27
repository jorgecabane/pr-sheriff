import { z } from 'zod'
import { logger } from '../utils/logger.js'

const GlobalConfigSchema = z.object({
  github: z.object({
    app_id: z.string(),
    private_key_path: z.string(),
    webhook_secret: z.string(),
  }),
  slack: z.object({
    token: z.string(),
    api_base_url: z.string().default('https://slack.com/api'),
  }),
  assignment: z.object({
    strategies: z.array(z.string()),
    default_strategy: z.string(),
  }),
  notifications: z.object({
    retry: z.object({
      max_attempts: z.number().default(3),
      backoff_ms: z.number().default(1000),
    }),
  }),
  scheduler: z.object({
    timezone: z.string().default('UTC'),
    jobs: z.object({
      reminders: z.object({
        enabled: z.boolean().default(true),
        cron: z.string(),
      }),
      blame: z.object({
        enabled: z.boolean().default(true),
        cron: z.string(),
      }),
    }),
  }),
})

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>

let globalConfig: GlobalConfig | null = null

export function loadGlobalConfig(): GlobalConfig {
  if (globalConfig) {
    return globalConfig
  }

  try {
    // Por ahora usamos solo env vars (config.yml es opcional)
    // TODO: Cargar config.yml si existe
    const rawConfig = {
      github: {
        app_id: process.env.GITHUB_APP_ID || '',
        // Soporta path O contenido directo (para cloud deployments)
        private_key_path: process.env.GITHUB_PRIVATE_KEY_PATH || process.env.GITHUB_PRIVATE_KEY_CONTENT || '',
        webhook_secret: process.env.GITHUB_WEBHOOK_SECRET || '',
      },
      slack: {
        token: process.env.SLACK_BOT_TOKEN || '',
        api_base_url: 'https://slack.com/api',
      },
      assignment: {
        strategies: ['round-robin', 'random', 'least-busy'],
        default_strategy: 'round-robin',
      },
      notifications: {
        retry: {
          max_attempts: 3,
          backoff_ms: 1000,
        },
      },
      scheduler: {
        timezone: process.env.TIMEZONE || 'UTC',
        jobs: {
          reminders: {
            enabled: true,
            cron: '0 10 * * 1-5',
          },
          blame: {
            enabled: true,
            cron: '0 11 * * 1-5',
          },
        },
      },
    }

    globalConfig = GlobalConfigSchema.parse(rawConfig)
    logger.info('Global config loaded')
    
    return globalConfig
  } catch (error) {
    logger.error({ error }, 'Failed to load global config, using defaults')
    throw error
  }
}
