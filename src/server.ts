import Fastify from 'fastify'
import { loadGlobalConfig } from './config/global.js'
import { handleWebhook } from './github/webhook/handler.js'

export async function createServer() {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  })

  // Cargar configuración global
  const config = loadGlobalConfig()

  // Health check
  server.get('/health', async () => {
    return { status: 'ok' }
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

  return server
}
