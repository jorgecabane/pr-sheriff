import { GlobalConfig } from './global.js'
import { RepositoryConfig } from './repository.js'

export interface ResolvedConfig {
  global: GlobalConfig
  repository: RepositoryConfig
}

/**
 * Resolves final configuration by merging global defaults with repository-specific config
 */
export function resolveConfig(
  global: GlobalConfig,
  repository: RepositoryConfig
): ResolvedConfig {
  return {
    global,
    repository,
  }
}
