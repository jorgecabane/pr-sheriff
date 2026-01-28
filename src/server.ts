import Fastify from 'fastify'
import { loadGlobalConfig } from './config/global.js'
import { handleWebhook } from './github/webhook/handler.js'
import { logger } from './utils/logger.js'

export async function createServer() {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  })

  // Cargar configuración global
  const config = loadGlobalConfig()

  // Inicializar base de datos si está configurada
  if (config.database.enabled && config.database.url) {
    try {
      // Import estático - si postgres no está instalado, fallará aquí
      const { initDatabase } = await import('./db/client.js')
      initDatabase(config.database.url)
      logger.info('Database enabled and initialized')
    } catch (error) {
      const err = error as Error & { code?: string }
      // Si es ERR_MODULE_NOT_FOUND, significa que postgres no está instalado
      if (err.code === 'ERR_MODULE_NOT_FOUND') {
        logger.warn('Postgres module not found. Install it with: npm install postgres')
        logger.info('Continuing without database (stateless mode)')
      } else {
        logger.error({ error: err.message, code: err.code }, 'Failed to initialize database, continuing without it')
      }
    }
  } else {
    logger.info('Database disabled or not configured, running in stateless mode')
  }

  // Health check
  server.get('/health', async () => {
    let dbHealthy: boolean | null = null
    
    if (config.database.enabled) {
      try {
        const { healthCheck } = await import('./db/client.js')
        dbHealthy = await healthCheck()
      } catch (error) {
        logger.error({ error }, 'Database health check failed')
        dbHealthy = false
      }
    }
    
    return {
      status: 'ok',
      database: config.database.enabled
        ? dbHealthy
          ? 'connected'
          : 'disconnected'
        : 'disabled',
    }
  })

  // Content type parser personalizado para capturar raw body antes del parseo
  // Esto es necesario porque GitHub calcula el signature sobre el payload RAW
  // IMPORTANTE: Remover el parser por defecto primero
  server.removeContentTypeParser('application/json')
  
  server.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    // Guardar el raw body antes de parsear (necesario para validar signature)
    const bodyString = body as string
    ;(req as { rawBody?: string }).rawBody = bodyString
    
    try {
      const json = JSON.parse(bodyString)
      done(null, json)
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  // Webhook handler de GitHub
  server.post('/webhook/github', async (request, reply) => {
    return handleWebhook(request, reply, config)
  })

  // Job endpoint para reminders (ejecutado por cron externo)
  server.post('/jobs/reminders', async (request, reply) => {
    // Verificar autenticación básica (opcional pero recomendado)
    const authToken = request.headers['authorization']
    const expectedToken = process.env.JOBS_SECRET_TOKEN

    if (expectedToken && authToken !== `Bearer ${expectedToken}`) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    try {
      const { runRemindersJob } = await import('./jobs/reminders.js')
      const result = await runRemindersJob(config)

      return {
        success: true,
        ...result,
      }
    } catch (error) {
      logger.error({ error }, 'Error executing reminders job')
      return reply.code(500).send({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

  // Job endpoint para blame (ejecutado por cron externo)
  server.post('/jobs/blame', async (request, reply) => {
    // Verificar autenticación básica (opcional pero recomendado)
    const authToken = request.headers['authorization']
    const expectedToken = process.env.JOBS_SECRET_TOKEN

    if (expectedToken && authToken !== `Bearer ${expectedToken}`) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    try {
      const { runBlameJob } = await import('./jobs/blame.js')
      const result = await runBlameJob(config)

      return {
        success: true,
        ...result,
      }
    } catch (error) {
      logger.error({ error }, 'Error executing blame job')
      return reply.code(500).send({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

  return server
}
