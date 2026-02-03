#!/usr/bin/env tsx

/**
 * Ejecuta las acciones del webhook (auto assign + notificación Slack) llamando
 * a las mismas funciones internas que usa el servidor. No hace HTTP.
 *
 * Uso:
 *   tsx scripts/run-webhook-actions.ts
 *   tsx scripts/run-webhook-actions.ts tests/fixtures/webhook-payload-local.json
 *
 * Variables de entorno: las mismas que el servidor (.env): GITHUB_APP_ID,
 * GITHUB_PRIVATE_KEY_PATH o GITHUB_PRIVATE_KEY_CONTENT, SLACK_BOT_TOKEN, etc.
 */

import 'dotenv/config'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { loadGlobalConfig } from '../src/config/global.js'
import { processWebhookEvent } from '../src/github/webhook/events.js'
import { logger } from '../src/utils/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DEFAULT_PAYLOAD_FILE = join(__dirname, '../tests/fixtures/webhook-pull-request-opened.json')
const PAYLOAD_FILE = process.argv[2] || DEFAULT_PAYLOAD_FILE
const EVENT = 'pull_request'
const DELIVERY_ID = `test-delivery-${Date.now()}`

async function main() {
  console.log('🔧 Run webhook actions (auto assign + Slack)')
  console.log('   Payload file:', PAYLOAD_FILE)
  console.log('')

  const config = loadGlobalConfig()

  // Inicializar DB igual que el servidor (para round-robin / least-busy con persistencia)
  if (config.database.enabled && config.database.url) {
    try {
      const { initDatabase } = await import('../src/db/client.js')
      initDatabase(config.database.url)
      logger.info('Database enabled and initialized')
    } catch (error) {
      const err = error as Error & { code?: string }
      if (err.code === 'ERR_MODULE_NOT_FOUND') {
        logger.warn('Postgres module not found. Continuing without database (stateless mode)')
      } else {
        logger.warn({ error: err.message }, 'Failed to init database, continuing without it')
      }
    }
  }

  let payload: unknown
  try {
    const raw = readFileSync(PAYLOAD_FILE, 'utf-8')
    payload = JSON.parse(raw)
  } catch (error) {
    console.error('❌ Error reading payload file:', (error as Error).message)
    process.exit(1)
  }

  try {
    await processWebhookEvent(EVENT, payload, config, DELIVERY_ID)
    console.log('')
    console.log('✅ Webhook actions completed (revisa logs arriba: auto assign, Slack, etc.)')
  } catch (error) {
    console.error('❌ Error running webhook actions:', error)
    process.exit(1)
  }
}

main()
