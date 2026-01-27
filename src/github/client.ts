import { getInstallationToken } from './auth.js'
import { GlobalConfig } from '../config/global.js'
import { logger } from '../utils/logger.js'

export class GitHubClient {
  private appId: string
  private privateKeyPath?: string
  private privateKeyContent?: string

  constructor(config: GlobalConfig) {
    this.appId = config.github.app_id
    this.privateKeyPath = config.github.private_key_path || undefined
    this.privateKeyContent = (config.github as { private_key_content?: string }).private_key_content || undefined
  }

  /**
   * Obtiene un token de instalación para hacer requests a la API
   */
  async getToken(installationId: string): Promise<string> {
    return getInstallationToken(
      installationId, 
      this.appId, 
      this.privateKeyPath, 
      this.privateKeyContent
    )
  }

  /**
   * Hace un request autenticado a la GitHub API
   */
  async request(
    installationId: string,
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const token = await this.getToken(installationId)
    
    const url = `https://api.github.com${path}`
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const error = await response.text()
      logger.error(
        { method, path, status: response.status, error },
        'GitHub API request failed'
      )
      throw new Error(`GitHub API error: ${response.status} ${error}`)
    }

    return response.json()
  }

  /**
   * Obtiene el contenido de un archivo del repositorio
   * @param ref - Branch, tag o commit SHA (opcional, por defecto usa la branch por defecto)
   */
  async getFileContent(
    installationId: string,
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<string> {
    // Construir URL con query parameter ref si se proporciona
    let url = `/repos/${owner}/${repo}/contents/${path}`
    if (ref) {
      url += `?ref=${encodeURIComponent(ref)}`
    }
    
    const response = await this.request(
      installationId,
      'GET',
      url
    ) as { content: string; encoding: string }

    // GitHub devuelve el contenido en base64
    if (response.encoding === 'base64') {
      return Buffer.from(response.content, 'base64').toString('utf-8')
    }
    
    return response.content
  }
}
