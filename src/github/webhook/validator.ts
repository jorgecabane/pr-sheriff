import { createHmac } from 'crypto'
import { logger } from '../../utils/logger.js'

/**
 * Valida la signature de un webhook de GitHub
 */
export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature) {
    logger.warn('Missing webhook signature')
    return false
  }

  if (!secret) {
    logger.error('Webhook secret is not configured')
    return false
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  
  const expectedSignatureWithPrefix = `sha256=${expectedSignature}`
  
  // Debug logging (solo en desarrollo)
  if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
    logger.debug({
      receivedSignature: signature.substring(0, 20) + '...',
      expectedSignature: expectedSignatureWithPrefix.substring(0, 20) + '...',
      payloadLength: payload.length,
      payloadPreview: payload.substring(0, 100) + '...',
    }, 'Signature validation debug')
  }
  
  // Usar timing-safe comparison para evitar timing attacks
  if (signature.length !== expectedSignatureWithPrefix.length) {
    logger.warn({
      receivedLength: signature.length,
      expectedLength: expectedSignatureWithPrefix.length,
    }, 'Signature length mismatch')
    return false
  }

  let mismatch = 0
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expectedSignatureWithPrefix.charCodeAt(i)
  }

  const isValid = mismatch === 0
  
  if (!isValid) {
    logger.warn({
      received: signature.substring(0, 30) + '...',
      expected: expectedSignatureWithPrefix.substring(0, 30) + '...',
    }, 'Invalid webhook signature')
  }

  return isValid
}
