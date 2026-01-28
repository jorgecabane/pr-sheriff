import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('loadGlobalConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    // Limpiar caché de config
    process.env = { ...originalEnv }
    // Resetear el módulo para limpiar el caché interno
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })
  
  // Helper para cargar el módulo fresco en cada test
  async function loadConfig() {
    const { loadGlobalConfig } = await import('../../../src/config/global.js')
    return loadGlobalConfig()
  }

  it('debe cargar configuración desde variables de entorno', async () => {
    process.env.GITHUB_APP_ID = '123456'
    process.env.GITHUB_PRIVATE_KEY_PATH = '/path/to/key.pem'
    process.env.GITHUB_WEBHOOK_SECRET = 'webhook-secret'
    process.env.SLACK_BOT_TOKEN = 'xoxb-token'

    const config = await loadConfig()

    expect(config.github.app_id).toBe('123456')
    expect(config.github.private_key_path).toBe('/path/to/key.pem')
    expect(config.github.webhook_secret).toBe('webhook-secret')
    expect(config.slack.token).toBe('xoxb-token')
  })

  it('debe usar GITHUB_PRIVATE_KEY_CONTENT si GITHUB_PRIVATE_KEY_PATH no está', async () => {
    delete process.env.GITHUB_PRIVATE_KEY_PATH
    process.env.GITHUB_APP_ID = '123456'
    process.env.GITHUB_PRIVATE_KEY_CONTENT = '-----BEGIN RSA PRIVATE KEY-----\nMOCK_KEY\n-----END RSA PRIVATE KEY-----'
    process.env.GITHUB_WEBHOOK_SECRET = 'webhook-secret'
    process.env.SLACK_BOT_TOKEN = 'xoxb-token'

    const config = await loadConfig()

    expect(config.github.private_key_path).toBe(process.env.GITHUB_PRIVATE_KEY_CONTENT)
  })

  it('debe usar valores por defecto para campos opcionales', async () => {
    process.env.GITHUB_APP_ID = '123456'
    process.env.GITHUB_PRIVATE_KEY_PATH = '/path/to/key.pem'
    process.env.GITHUB_WEBHOOK_SECRET = 'webhook-secret'
    process.env.SLACK_BOT_TOKEN = 'xoxb-token'

    const config = await loadConfig()

    expect(config.slack.api_base_url).toBe('https://slack.com/api')
    expect(config.database.enabled).toBe(false)
    expect(config.notifications.retry.max_attempts).toBe(3)
    expect(config.notifications.retry.backoff_ms).toBe(1000)
  })

  it('debe habilitar database si DATABASE_URL está configurada', async () => {
    process.env.GITHUB_APP_ID = '123456'
    process.env.GITHUB_PRIVATE_KEY_PATH = '/path/to/key.pem'
    process.env.GITHUB_WEBHOOK_SECRET = 'webhook-secret'
    process.env.SLACK_BOT_TOKEN = 'xoxb-token'
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test'

    const config = await loadConfig()

    expect(config.database.enabled).toBe(true)
    expect(config.database.url).toBe('postgresql://localhost:5432/test')
  })

  it('debe cachear la configuración', async () => {
    process.env.GITHUB_APP_ID = '123456'
    process.env.GITHUB_PRIVATE_KEY_PATH = '/path/to/key.pem'
    process.env.GITHUB_WEBHOOK_SECRET = 'webhook-secret'
    process.env.SLACK_BOT_TOKEN = 'xoxb-token'

    const { loadGlobalConfig } = await import('../../../src/config/global.js')
    const config1 = loadGlobalConfig()
    const config2 = loadGlobalConfig()

    // Debe ser la misma instancia (caché)
    expect(config1).toBe(config2)
  })

  it('debe cargar configuración con valores vacíos si no hay env vars', async () => {
    // Limpiar todas las variables requeridas
    delete process.env.GITHUB_APP_ID
    delete process.env.GITHUB_PRIVATE_KEY_PATH
    delete process.env.GITHUB_PRIVATE_KEY_CONTENT
    delete process.env.GITHUB_WEBHOOK_SECRET
    delete process.env.SLACK_BOT_TOKEN

    const { loadGlobalConfig } = await import('../../../src/config/global.js')
    
    // Nota: El schema actual acepta strings vacíos, así que no lanzará error
    // pero los valores serán strings vacíos
    const config = loadGlobalConfig()
    
    expect(config.github.app_id).toBe('')
    expect(config.github.private_key_path).toBe('')
    expect(config.github.webhook_secret).toBe('')
    expect(config.slack.token).toBe('')
  })

  it('debe incluir configuración de scheduler', async () => {
    process.env.GITHUB_APP_ID = '123456'
    process.env.GITHUB_PRIVATE_KEY_PATH = '/path/to/key.pem'
    process.env.GITHUB_WEBHOOK_SECRET = 'webhook-secret'
    process.env.SLACK_BOT_TOKEN = 'xoxb-token'
    process.env.TIMEZONE = 'America/Santiago'

    const config = await loadConfig()

    expect(config.scheduler.timezone).toBe('America/Santiago')
    expect(config.scheduler.jobs.reminders.enabled).toBe(true)
    expect(config.scheduler.jobs.blame.enabled).toBe(true)
  })
})
