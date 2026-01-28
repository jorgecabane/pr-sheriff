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
  database: z.object({
    url: z.string().optional(), // PostgreSQL connection string
    enabled: z.boolean().default(false), // Permitir funcionar sin DB (fallback)
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
      database: {
        url: process.env.DATABASE_URL || '',
        enabled: !!process.env.DATABASE_URL, // Solo habilitar si hay connection string
      },
      notifications: {
        retry: {
          max_attempts: 3,
          backoff_ms: 1000,
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
