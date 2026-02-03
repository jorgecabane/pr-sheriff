import 'dotenv/config'
import { createServer } from './server.js'
import { logger } from './utils/logger.js'

const PORT = Number(process.env.PORT) || 3000

async function main() {
  try {
    const server = await createServer()
    
    await server.listen({ port: PORT, host: '0.0.0.0' })
    
    logger.info({ port: PORT }, 'Server started')
  } catch (error) {
    logger.error({ error }, 'Failed to start server')
    process.exit(1)
  }
}

main()
