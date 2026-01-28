import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'

// Mock de fs
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}))

// Mock de fetch
global.fetch = vi.fn()

// Mock de jwt - debe estar antes de importar auth
vi.mock('jsonwebtoken', () => {
  const mockJwtSign = vi.fn((payload, _key, _options) => {
    // Retornar un JWT mock válido con formato JWT real
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return `${header}.${payloadB64}.signature`
  })

  const mockJwtDecode = vi.fn((token) => {
    // Decodificar el token mock
    const parts = token.split('.')
    if (parts.length === 3) {
      try {
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      } catch {
        return null
      }
    }
    return null
  })

  return {
    default: {
      sign: mockJwtSign,
      decode: mockJwtDecode,
    },
  }
})

// Importar después de los mocks
import { generateJWT, getInstallationToken } from '../../../src/github/auth.js'
import jwt from 'jsonwebtoken'

describe('generateJWT', () => {
  const appId = '123456'
  // Usar una private key RSA válida para tests (formato mínimo)
  const privateKeyContent = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAyV2k5+example+key+for+testing+purposes+only
-----END RSA PRIVATE KEY-----`

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('debe generar JWT con contenido directo de private key', () => {
    const token = generateJWT(appId, privateKeyContent)

    expect(token).toBeDefined()
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3) // JWT tiene 3 partes
  })

  it('debe leer private key desde archivo si es un path', () => {
    const keyPath = '/path/to/key.pem'
    const keyContent = '-----BEGIN RSA PRIVATE KEY-----\nMOCK_KEY\n-----END RSA PRIVATE KEY-----'

    vi.mocked(readFileSync).mockReturnValue(keyContent)

    const token = generateJWT(appId, keyPath)

    expect(readFileSync).toHaveBeenCalledWith(keyPath, 'utf-8')
    expect(token).toBeDefined()
  })

  it('debe detectar paths que empiezan con /', () => {
    const keyPath = '/absolute/path/key.pem'
    const keyContent = '-----BEGIN RSA PRIVATE KEY-----\nMOCK_KEY\n-----END RSA PRIVATE KEY-----'

    vi.mocked(readFileSync).mockReturnValue(keyContent)

    generateJWT(appId, keyPath)

    expect(readFileSync).toHaveBeenCalledWith(keyPath, 'utf-8')
  })

  it('debe detectar paths relativos', () => {
    const keyPath = './secrets/key.pem'
    const keyContent = '-----BEGIN RSA PRIVATE KEY-----\nMOCK_KEY\n-----END RSA PRIVATE KEY-----'

    vi.mocked(readFileSync).mockReturnValue(keyContent)

    generateJWT(appId, keyPath)

    expect(readFileSync).toHaveBeenCalledWith(keyPath, 'utf-8')
  })

  it('debe detectar paths con ~', () => {
    const keyPath = '~/keys/key.pem'
    const keyContent = '-----BEGIN RSA PRIVATE KEY-----\nMOCK_KEY\n-----END RSA PRIVATE KEY-----'

    vi.mocked(readFileSync).mockReturnValue(keyContent)

    generateJWT(appId, keyPath)

    expect(readFileSync).toHaveBeenCalledWith(keyPath, 'utf-8')
  })

  it('debe lanzar error si el archivo no existe', () => {
    const keyPath = '/nonexistent/key.pem'
    const error = new Error('ENOENT: no such file or directory')

    vi.mocked(readFileSync).mockImplementation(() => {
      throw error
    })

    expect(() => generateJWT(appId, keyPath)).toThrow()
  })

  it('debe incluir appId en el payload del JWT', () => {
    const token = generateJWT(appId, privateKeyContent)

    // Decodificar sin verificar (solo para test)
    const decoded = jwt.decode(token) as { iss?: string; iat?: number; exp?: number } | null

    expect(decoded).toBeDefined()
    if (decoded) {
      expect(decoded.iss).toBe(appId)
      expect(decoded.iat).toBeDefined()
      expect(decoded.exp).toBeDefined()
    }
  })
})

describe('getInstallationToken', () => {
  const appId = '123456'
  const privateKeyContent = '-----BEGIN RSA PRIVATE KEY-----\nMOCK_KEY\n-----END RSA PRIVATE KEY-----'

  beforeEach(() => {
    vi.clearAllMocks()
    // Resetear fetch mock
    vi.mocked(global.fetch).mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('debe obtener token desde GitHub API', async () => {
    const installationId = 'test-1' // ID único para este test
    const mockToken = 'ghs_mock_token_123'
    const expiresAt = new Date(Date.now() + 3600000).toISOString()

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: mockToken,
        expires_at: expiresAt,
      }),
    } as Response)

    const token = await getInstallationToken(installationId, appId, undefined, privateKeyContent)

    expect(token).toBe(mockToken)
    expect(global.fetch).toHaveBeenCalledWith(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': expect.stringContaining('Bearer '),
          'Accept': 'application/vnd.github.v3+json',
        }),
      })
    )
  })

  it('debe usar privateKeyContent si está disponible', async () => {
    const installationId = 'test-2' // ID único para este test
    const mockToken = 'ghs_mock_token_123'
    const expiresAt = new Date(Date.now() + 3600000).toISOString()

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: mockToken,
        expires_at: expiresAt,
      }),
    } as Response)

    await getInstallationToken(installationId, appId, undefined, privateKeyContent)

    // Verificar que se llamó fetch (lo que significa que se generó JWT)
    expect(global.fetch).toHaveBeenCalled()
  })

  it('debe usar privateKeyPath si privateKeyContent no está disponible', async () => {
    const installationId = 'test-3' // ID único para este test
    const keyPath = '/path/to/key.pem'
    const keyContent = '-----BEGIN RSA PRIVATE KEY-----\nMOCK_KEY\n-----END RSA PRIVATE KEY-----'
    const mockToken = 'ghs_mock_token_123'
    const expiresAt = new Date(Date.now() + 3600000).toISOString()

    vi.mocked(readFileSync).mockReturnValue(keyContent)
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: mockToken,
        expires_at: expiresAt,
      }),
    } as Response)

    await getInstallationToken(installationId, appId, keyPath, undefined)

    expect(global.fetch).toHaveBeenCalled()
  })

  it('debe lanzar error si no se proporciona privateKeyPath ni privateKeyContent', async () => {
    const installationId = 'test-4' // ID único para este test
    
    await expect(
      getInstallationToken(installationId, appId, undefined, undefined)
    ).rejects.toThrow('Either privateKeyPath or privateKeyContent must be provided')
  })

  it('debe lanzar error si GitHub API retorna error', async () => {
    const installationId = 'test-5' // ID único para este test
    
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    } as Response)

    await expect(
      getInstallationToken(installationId, appId, undefined, privateKeyContent)
    ).rejects.toThrow('Failed to get installation token')
  })

  it('debe cachear tokens válidos', async () => {
    const installationId = 'test-cache' // ID único para este test
    const mockToken = 'ghs_mock_token_123'
    const expiresAt = new Date(Date.now() + 3600000).toISOString()

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        token: mockToken,
        expires_at: expiresAt,
      }),
    } as Response)

    // Primera llamada
    const token1 = await getInstallationToken(installationId, appId, undefined, privateKeyContent)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    // Segunda llamada (debe usar caché)
    const token2 = await getInstallationToken(installationId, appId, undefined, privateKeyContent)
    expect(global.fetch).toHaveBeenCalledTimes(1) // No debe llamar de nuevo
    expect(token1).toBe(token2)
  })
})
