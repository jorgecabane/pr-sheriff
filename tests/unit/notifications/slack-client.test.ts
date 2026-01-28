import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SlackClient } from '../../../src/notifications/slack/client.js'
import type { GlobalConfig } from '../../../src/config/global.js'
import type { SlackMessage } from '../../../src/notifications/slack/client.js'

// Mock de fetch
global.fetch = vi.fn()

describe('SlackClient', () => {
  let config: GlobalConfig
  let client: SlackClient

  beforeEach(() => {
    vi.clearAllMocks()

    config = {
      github: {
        app_id: '123',
        private_key_path: 'key.pem',
        webhook_secret: 'secret',
      },
      slack: {
        token: 'xoxb-test-token',
        api_base_url: 'https://slack.com/api',
      },
      database: {
        enabled: false,
        url: undefined,
      },
      assignment: {
        strategies: ['round-robin'],
        default_strategy: 'round-robin',
      },
      notifications: {
        retry: {
          max_attempts: 3,
          backoff_ms: 1000,
        },
      },
    }

    client = new SlackClient(config)
  })

  it('debe enviar mensaje a canal exitosamente', async () => {
    const message: SlackMessage = {
      channel: 'C123',
      text: 'Test message',
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => '{"ok": true}',
    } as Response)

    await client.sendMessage(message)

    expect(global.fetch).toHaveBeenCalledWith(
      'https://slack.com/api/chat.postMessage',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer xoxb-test-token',
        }),
        body: JSON.stringify({
          text: 'Test message',
          channel: 'C123',
        }),
      })
    )
  })

  it('debe enviar DM usando conversations.open', async () => {
    const message: SlackMessage = {
      user: 'U123',
      text: 'DM message',
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => '{"ok": true}',
    } as Response)

    await client.sendMessage(message)

    expect(global.fetch).toHaveBeenCalledWith(
      'https://slack.com/api/conversations.open',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          text: 'DM message',
          user: 'U123',
        }),
      })
    )
  })

  it('debe incluir blocks en el mensaje', async () => {
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Block message',
        },
      },
    ]

    const message: SlackMessage = {
      channel: 'C123',
      text: 'Fallback text',
      blocks,
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => '{"ok": true}',
    } as Response)

    await client.sendMessage(message)

    const callArgs = vi.mocked(global.fetch).mock.calls[0]
    const body = JSON.parse(callArgs[1]?.body as string)

    expect(body.blocks).toEqual(blocks)
  })

  it('debe lanzar error si Slack API retorna error', async () => {
    const message: SlackMessage = {
      channel: 'C123',
      text: 'Test message',
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => '{"ok": false, "error": "invalid_auth"}',
    } as Response)

    await expect(client.sendMessage(message)).rejects.toThrow('Slack API error')
  })

  it('debe usar api_base_url personalizado', async () => {
    const customConfig: GlobalConfig = {
      ...config,
      slack: {
        ...config.slack,
        api_base_url: 'https://custom-slack.com/api',
      },
    }

    const customClient = new SlackClient(customConfig)
    const message: SlackMessage = {
      channel: 'C123',
      text: 'Test message',
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => '{"ok": true}',
    } as Response)

    await customClient.sendMessage(message)

    expect(global.fetch).toHaveBeenCalledWith(
      'https://custom-slack.com/api/chat.postMessage',
      expect.anything()
    )
  })

  it('debe manejar errores de red', async () => {
    const message: SlackMessage = {
      channel: 'C123',
      text: 'Test message',
    }

    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

    await expect(client.sendMessage(message)).rejects.toThrow('Network error')
  })

  it('debe incluir solo text si no hay blocks', async () => {
    const message: SlackMessage = {
      channel: 'C123',
      text: 'Simple message',
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => '{"ok": true}',
    } as Response)

    await client.sendMessage(message)

    const callArgs = vi.mocked(global.fetch).mock.calls[0]
    const body = JSON.parse(callArgs[1]?.body as string)

    expect(body.text).toBe('Simple message')
    expect(body.blocks).toBeUndefined()
  })
})
