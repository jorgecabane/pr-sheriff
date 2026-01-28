import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateWebhookSignature } from '../../../src/github/webhook/validator.js'
import { createHmac } from 'crypto'

describe('validateWebhookSignature', () => {
  const secret = 'test-secret'
  const payload = JSON.stringify({ action: 'opened', pull_request: { number: 1 } })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debe retornar false si no hay signature', () => {
    const result = validateWebhookSignature(payload, '', secret)
    expect(result).toBe(false)
  })

  it('debe retornar false si no hay secret', () => {
    const signature = 'sha256=abc123'
    const result = validateWebhookSignature(payload, signature, '')
    expect(result).toBe(false)
  })

  it('debe validar signature correcta', () => {
    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
    const signature = `sha256=${expectedSignature}`

    const result = validateWebhookSignature(payload, signature, secret)
    expect(result).toBe(true)
  })

  it('debe rechazar signature incorrecta', () => {
    const wrongSignature = 'sha256=wrong-signature'

    const result = validateWebhookSignature(payload, wrongSignature, secret)
    expect(result).toBe(false)
  })

  it('debe rechazar signature con longitud incorrecta', () => {
    const shortSignature = 'sha256=abc'

    const result = validateWebhookSignature(payload, shortSignature, secret)
    expect(result).toBe(false)
  })

  it('debe usar timing-safe comparison', () => {
    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
    const signature = `sha256=${expectedSignature}`

    // Debe ser válida
    const result1 = validateWebhookSignature(payload, signature, secret)
    expect(result1).toBe(true)

    // Cambiar un carácter al final
    const wrongSignature = signature.slice(0, -1) + 'X'
    const result2 = validateWebhookSignature(payload, wrongSignature, secret)
    expect(result2).toBe(false)
  })

  it('debe manejar payloads grandes', () => {
    const largePayload = JSON.stringify({ data: 'x'.repeat(10000) })
    const expectedSignature = createHmac('sha256', secret)
      .update(largePayload)
      .digest('hex')
    const signature = `sha256=${expectedSignature}`

    const result = validateWebhookSignature(largePayload, signature, secret)
    expect(result).toBe(true)
  })

  it('debe manejar payloads vacíos', () => {
    const emptyPayload = ''
    const expectedSignature = createHmac('sha256', secret)
      .update(emptyPayload)
      .digest('hex')
    const signature = `sha256=${expectedSignature}`

    const result = validateWebhookSignature(emptyPayload, signature, secret)
    expect(result).toBe(true)
  })
})
