import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotificationEngine } from '../../../src/notifications/engine.js'
import type { GlobalConfig } from '../../../src/config/global.js'
import type { SlackMessage } from '../../../src/notifications/slack/client.js'

// Mock del SlackClient
const mockSendMessage = vi.fn()
vi.mock('../../../src/notifications/slack/client.js', () => {
  return {
    SlackClient: class {
      sendMessage = mockSendMessage
    },
  }
})

describe('NotificationEngine', () => {
  let config: GlobalConfig
  let engine: NotificationEngine

  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMessage.mockClear()

    config = {
      github: {
        app_id: '123',
        private_key_path: 'key.pem',
        webhook_secret: 'secret',
      },
      slack: {
        token: 'xoxb-token',
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
          backoff_ms: 100,
        },
      },
    }

    engine = new NotificationEngine(config)
  })

  it('debe enviar mensaje exitosamente en el primer intento', async () => {
    const message: SlackMessage = {
      channel: 'C123',
      text: 'Test message',
    }

    mockSendMessage.mockResolvedValueOnce(undefined)

    await engine.send(message)

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledWith(message)
  })

  it('debe reintentar si falla el primer intento', async () => {
    const message: SlackMessage = {
      channel: 'C123',
      text: 'Test message',
    }

    // Fallar primero, luego éxito
    mockSendMessage
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(undefined)

    await engine.send(message)

    expect(mockSendMessage).toHaveBeenCalledTimes(2)
  })

  it('debe usar backoff exponencial entre reintentos', async () => {
    const message: SlackMessage = {
      channel: 'C123',
      text: 'Test message',
    }

    let callTimes: number[] = []

    mockSendMessage.mockImplementation(async () => {
      callTimes.push(Date.now())
      if (callTimes.length < 3) {
        throw new Error('Network error')
      }
    })

    await engine.send(message)

    // Verificar que hubo delays entre llamadas
    if (callTimes.length >= 2) {
      const delay1 = callTimes[1] - callTimes[0]
      const delay2 = callTimes[2] - callTimes[1]

      // delay1 debería ser ~100ms (backoff_ms * 2^0)
      // delay2 debería ser ~200ms (backoff_ms * 2^1)
      expect(delay1).toBeGreaterThanOrEqual(90) // Permitir un poco de margen
      expect(delay2).toBeGreaterThanOrEqual(180)
    }
  })

  it('debe lanzar error después de todos los reintentos fallidos', async () => {
    const message: SlackMessage = {
      channel: 'C123',
      text: 'Test message',
    }

    const error = new Error('Persistent error')
    mockSendMessage.mockRejectedValue(error)

    await expect(engine.send(message)).rejects.toThrow('Persistent error')
    expect(mockSendMessage).toHaveBeenCalledTimes(3) // max_attempts = 3
  })

  it('debe respetar max_attempts de la configuración', async () => {
    const customConfig: GlobalConfig = {
      ...config,
      notifications: {
        retry: {
          max_attempts: 5,
          backoff_ms: 50,
        },
      },
    }

    const customEngine = new NotificationEngine(customConfig)
    const message: SlackMessage = {
      channel: 'C123',
      text: 'Test message',
    }

    mockSendMessage.mockRejectedValue(new Error('Error'))

    await expect(customEngine.send(message)).rejects.toThrow()
    expect(mockSendMessage).toHaveBeenCalledTimes(5)
  })

  it('debe manejar mensajes con user (DM)', async () => {
    const message: SlackMessage = {
      user: 'U123',
      text: 'DM message',
    }

    mockSendMessage.mockResolvedValueOnce(undefined)

    await engine.send(message)

    expect(mockSendMessage).toHaveBeenCalledWith(message)
  })

  it('debe manejar mensajes con blocks', async () => {
    const message: SlackMessage = {
      channel: 'C123',
      text: 'Fallback text',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Block message',
          },
        },
      ],
    }

    mockSendMessage.mockResolvedValueOnce(undefined)

    await engine.send(message)

    expect(mockSendMessage).toHaveBeenCalledWith(message)
  })
})
