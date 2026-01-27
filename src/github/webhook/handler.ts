import { FastifyRequest, FastifyReply } from 'fastify'
import { validateWebhookSignature } from './validator.js'
import { processWebhookEvent } from './events.js'
import { logger } from '../../utils/logger.js'
import { GlobalConfig } from '../../config/global.js'

export async function handleWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
  config: GlobalConfig
) {
  const signature = request.headers['x-hub-signature-256'] as string
  const event = request.headers['x-github-event'] as string
  const deliveryId = request.headers['x-github-delivery'] as string

  logger.info({ event, deliveryId }, 'Received webhook')

  // Obtener raw body del request
  // El contentTypeParser personalizado guarda el raw body antes de parsear
  const rawBody = (request as { rawBody?: string }).rawBody
  
  if (!rawBody) {
    logger.error({ 
      deliveryId,
      hasBody: !!request.body,
      bodyType: typeof request.body,
    }, 'Raw body not available for signature validation')
    return reply.code(500).send({ error: 'Internal server error' })
  }
  
  const payload = rawBody
  
  logger.debug({ 
    payloadLength: payload.length,
    payloadStart: payload.substring(0, 50),
  }, 'Using raw body for signature validation')

  // Validar signature
  // GitHub calcula el signature sobre el payload RAW (string original), no sobre el objeto parseado
  const isValid = validateWebhookSignature(
    payload,
    signature,
    config.github.webhook_secret
  )

  if (!isValid) {
    logger.warn({ deliveryId }, 'Invalid webhook signature')
    return reply.code(401).send({ error: 'Invalid signature' })
  }

  // Responder rápido (procesar async)
  reply.code(200).send({ received: true })

  // Procesar evento async (no esperar)
  processWebhookEvent(event, request.body as unknown, config).catch(error => {
    logger.error({ error, event, deliveryId }, 'Error processing webhook event')
  })

  return
}
