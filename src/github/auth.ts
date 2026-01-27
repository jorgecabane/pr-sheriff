import { readFileSync } from 'fs'
import jwt from 'jsonwebtoken'
import { logger } from '../utils/logger.js'

interface InstallationToken {
  token: string
  expiresAt: number
}

// Caché en memoria de installation tokens
const tokenCache = new Map<string, InstallationToken>()

/**
 * Obtiene la private key desde path o contenido directo
 */
function getPrivateKey(privateKeyPathOrContent: string): string {
  // Si parece un path (empieza con /, ./, ~, o contiene / y termina en .pem)
  const looksLikePath = 
    privateKeyPathOrContent.startsWith('/') ||
    privateKeyPathOrContent.startsWith('./') ||
    privateKeyPathOrContent.startsWith('~/') ||
    (privateKeyPathOrContent.includes('/') && privateKeyPathOrContent.endsWith('.pem'))
  
  if (looksLikePath) {
    // Es un path, leer el archivo
    try {
      return readFileSync(privateKeyPathOrContent, 'utf-8')
    } catch (error) {
      logger.error({ error, path: privateKeyPathOrContent }, 'Failed to read private key file')
      throw error
    }
  } else {
    // Es el contenido directo (desde variable de entorno o secret manager)
    return privateKeyPathOrContent
  }
}

/**
 * Genera un JWT para autenticación como GitHub App
 * 
 * Soporta:
 * - Path a archivo: "/path/to/key.pem" o "./secrets/key.pem"
 * - Contenido directo: "-----BEGIN RSA PRIVATE KEY-----\n..."
 */
export function generateJWT(appId: string, privateKeyPathOrContent: string): string {
  try {
    const privateKey = getPrivateKey(privateKeyPathOrContent)
    
    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iat: now - 60, // Emitido 60 segundos antes para evitar problemas de reloj
      exp: now + 600, // Expira en 10 minutos
      iss: appId,
    }

    return jwt.sign(payload, privateKey, { algorithm: 'RS256' })
  } catch (error) {
    logger.error({ error, appId }, 'Failed to generate JWT')
    throw error
  }
}

/**
 * Obtiene un installation token (con caché)
 */
export async function getInstallationToken(
  installationId: string,
  appId: string,
  privateKeyPath?: string,
  privateKeyContent?: string
): Promise<string> {
  // Verificar caché
  const cached = tokenCache.get(installationId)
  if (cached && cached.expiresAt > Date.now()) {
    logger.debug({ installationId }, 'Using cached installation token')
    return cached.token
  }

  // Generar nuevo token
  logger.debug({ installationId }, 'Fetching new installation token')
  
  // Usar privateKeyContent si está disponible, sino usar privateKeyPath
  const privateKey = privateKeyContent || privateKeyPath
  if (!privateKey) {
    throw new Error('Either privateKeyPath or privateKeyContent must be provided')
  }
  
  const jwtToken = generateJWT(appId, privateKey)
  
  // Hacer request a GitHub API para obtener installation token
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    }
  )

  if (!response.ok) {
    const error = await response.text()
    logger.error({ installationId, error }, 'Failed to get installation token')
    throw new Error(`Failed to get installation token: ${response.status} ${error}`)
  }

  const data = (await response.json()) as { token: string; expires_at: string }
  
  // GitHub devuelve expires_at como ISO string
  const expiresAt = new Date(data.expires_at).getTime() - 5 * 60 * 1000 // 5 min antes de expirar
  const token = data.token

  tokenCache.set(installationId, { token, expiresAt })
  
  return token
}
