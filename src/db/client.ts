import { logger } from '../utils/logger.js'
import * as schema from './schema.js'

// Import estático - si el módulo no está disponible, fallará al cargar el archivo
// Esto es intencional: queremos que falle temprano si postgres no está instalado
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'

let db: ReturnType<typeof drizzle> | null = null
let client: postgres.Sql | null = null

/**
 * Inicializa la conexión a la base de datos
 */
export function initDatabase(connectionString: string): void {
  if (db) {
    logger.warn('Database already initialized')
    return
  }

  try {
    // postgres-js maneja el pooling automáticamente
    client = postgres(connectionString, {
      max: 10, // Connection pool size
    })

    db = drizzle(client, { schema })

    logger.info('Database connection initialized')
  } catch (error) {
    logger.error({ error }, 'Failed to initialize database connection')
    throw error
  }
}

/**
 * Verifica si la base de datos está disponible
 * @returns true si la DB está inicializada, false en caso contrario
 */
export function isDatabaseAvailable(): boolean {
  return db !== null
}

/**
 * Obtiene el cliente de la base de datos
 * @throws Error si la DB no está inicializada
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

/**
 * Cierra la conexión a la base de datos
 */
export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.end()
    client = null
    db = null
    logger.info('Database connection closed')
  }
}

/**
 * Verifica que la conexión a la DB funcione
 */
export async function healthCheck(): Promise<boolean> {
  if (!client) {
    return false
  }

  try {
    const result = await client`SELECT 1`
    return result.length > 0
  } catch (error) {
    logger.error({ error }, 'Database health check failed')
    return false
  }
}
