#!/usr/bin/env node

/**
 * Script para probar el webhook de GitHub localmente (envía POST al servidor).
 * El servidor procesa el evento en background (auto assign, Slack).
 *
 * Para ejecutar las acciones directamente sin servidor (misma lógica interna):
 *   npm run test:webhook:run
 *   npm run test:webhook:run -- tests/fixtures/webhook-payload-local.json
 *
 * Uso:
 *   node scripts/test-webhook.js
 *   node scripts/test-webhook.js path/to/mi-payload.json
 *
 * Variables de entorno:
 *   GITHUB_WEBHOOK_SECRET - Secret del webhook (default: "test-secret")
 *   SERVER_URL - URL del servidor (default: "http://localhost:3000")
 */

import { createHmac } from 'crypto'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'test-secret'
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000'
const ENDPOINT = `${SERVER_URL}/webhook/github`
const DEFAULT_FIXTURE = join(__dirname, '../tests/fixtures/webhook-pull-request-opened.json')
const PAYLOAD_FILE = process.argv[2] || DEFAULT_FIXTURE

// Leer el payload (desde archivo pasado por arg o fixture por defecto)
const payload = readFileSync(PAYLOAD_FILE, 'utf-8')
const payloadJson = JSON.parse(payload)

// Generar signature (HMAC SHA256)
const signature = createHmac('sha256', WEBHOOK_SECRET)
  .update(payload)
  .digest('hex')
const signatureHeader = `sha256=${signature}`

// Headers requeridos por GitHub
const headers = {
  'Content-Type': 'application/json',
  'X-GitHub-Event': 'pull_request',
  'X-GitHub-Delivery': `test-delivery-${Date.now()}`,
  'X-Hub-Signature-256': signatureHeader,
}

console.log('🚀 Testing webhook endpoint:', ENDPOINT)
console.log('   Payload file:', PAYLOAD_FILE)
console.log('')
console.log('Payload:')
console.log(JSON.stringify(payloadJson, null, 2))
console.log('')
console.log('Headers:')
console.log(JSON.stringify(headers, null, 2))
console.log('')

// Hacer el request
try {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: payload,
  })

  const responseBody = await response.text()
  
  console.log('Response:')
  console.log(`HTTP Status: ${response.status}`)
  console.log(`Body: ${responseBody}`)
  console.log('')

  if (response.ok) {
    console.log('✅ Webhook recibido correctamente')
  } else {
    console.log('⚠️  Error en la respuesta')
  }
} catch (error) {
  console.error('❌ Error al hacer el request:', error.message)
  process.exit(1)
}
