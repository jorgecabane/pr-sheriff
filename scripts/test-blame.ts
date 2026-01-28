#!/usr/bin/env tsx

/**
 * Script para probar los mensajes de blame
 * 
 * Uso:
 *   tsx scripts/test-blame.ts <channel_id>
 * 
 * Ejemplo:
 *   tsx scripts/test-blame.ts C0ABFQMFQA0
 */

import 'dotenv/config'
import { loadGlobalConfig } from '../src/config/global.js'
import { NotificationEngine } from '../src/notifications/engine.js'
import { formatBlameMessage } from '../src/notifications/slack/messages.js'

const channelId = process.argv[2]

if (!channelId) {
  console.error('❌ Error: Debes proporcionar un Channel ID')
  console.log('\nUso: tsx scripts/test-blame.ts <channel_id>')
  console.log('Ejemplo: tsx scripts/test-blame.ts C0ABFQMFQA0')
  process.exit(1)
}

async function main() {
  try {
    const config = loadGlobalConfig()
    const notificationEngine = new NotificationEngine(config)

    // PRs de ejemplo para probar
    const testPRs = [
      {
        number: 1,
        title: 'feat: added a readme',
        author: 'jorgecabane',
        url: 'https://github.com/jorgecabane/pr-sheriff/pull/1',
        reviewers: ['knarf20'],
        reviewerSlackIds: ['U07QU7B1D46'],
        labels: ['documentation'],
      },
      {
        number: 3,
        title: 'refactor: improve error handling',
        author: 'knarf20',
        url: 'https://github.com/jorgecabane/pr-sheriff/pull/3',
        reviewers: ['jorgecabane'],
        reviewerSlackIds: ['U07QU7B1D46'],
        labels: ['refactor'],
      },
    ]

    const days = 2
    const message = formatBlameMessage(testPRs, days, channelId)

    console.log('📤 Enviando mensaje de blame a Slack...')
    console.log(`📢 Channel: ${channelId}`)
    console.log(`📋 PRs: ${testPRs.length}`)
    console.log(`⏰ Días: ${days}`)

    await notificationEngine.send(message)

    console.log('✅ Mensaje enviado exitosamente!')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
