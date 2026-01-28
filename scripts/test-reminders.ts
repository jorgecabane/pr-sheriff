#!/usr/bin/env tsx

/**
 * Script para probar los mensajes de reminders
 * 
 * Uso:
 *   tsx scripts/test-reminders.ts <slack_user_id>
 * 
 * Ejemplo:
 *   tsx scripts/test-reminders.ts U07QU7B1D46
 */

import 'dotenv/config'
import { loadGlobalConfig } from '../src/config/global.js'
import { NotificationEngine } from '../src/notifications/engine.js'
import { formatReminderMessage } from '../src/notifications/slack/messages.js'

const slackUserId = process.argv[2]

if (!slackUserId) {
  console.error('❌ Error: Debes proporcionar un Slack User ID')
  console.log('\nUso: tsx scripts/test-reminders.ts <slack_user_id>')
  console.log('Ejemplo: tsx scripts/test-reminders.ts U07QU7B1D46')
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
        labels: ['documentation'],
      },
      {
        number: 2,
        title: 'fix: webhook signature validation',
        author: 'knarf20',
        url: 'https://github.com/jorgecabane/pr-sheriff/pull/2',
        reviewers: ['jorgecabane'],
        labels: ['bug'],
      },
    ]

    const message = formatReminderMessage(testPRs, slackUserId)

    console.log('📤 Enviando mensaje de reminder a Slack...')
    console.log(`👤 User ID: ${slackUserId}`)
    console.log(`📋 PRs: ${testPRs.length}`)

    await notificationEngine.send(message)

    console.log('✅ Mensaje enviado exitosamente!')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
