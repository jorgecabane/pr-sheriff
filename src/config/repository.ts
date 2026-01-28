import { z } from 'zod'
import yaml from 'js-yaml'
import { logger } from '../utils/logger.js'

// Schema para .pr-sheriff.yml
const RepositoryConfigSchema = z.object({
  version: z.union([z.string(), z.number()]).optional(),
  team: z.object({
    name: z.string(),
    members: z.array(
      z.object({
        github: z.string(),
        slack: z.string(),
      })
    ),
  }),
  github: z.object({
    auto_assign: z.object({
      enabled: z.boolean(),
      reviewers_per_pr: z.number(),
      assignment_strategy: z.string(),
      exclude_authors: z.boolean(),
    }),
  }),
  notifications: z.object({
    new_pr_notifications: z.object({
      enabled: z.boolean(),
      channel: z.string(),
      include_reviewers: z.boolean().default(true),
      include_assignees: z.boolean().default(true),
      include_description: z.boolean().default(true),
      include_labels: z.boolean().default(true),
      include_files_changed: z.boolean().default(false),
    }),
    daily_reminders: z.object({
      enabled: z.boolean(),
      message_type: z.string().default('dm'),
    }),
    blame: z.object({
      enabled: z.boolean(),
      channel: z.string(),
      after_days: z.number(),
    }),
  }),
  rules: z.object({
    reviewers_per_pr: z.number(),
    exclude_labels: z.array(z.string()),
    include_labels: z.array(z.string()).default([]),
    timezone: z.string().default('UTC'),
  }),
})

export type RepositoryConfig = z.infer<typeof RepositoryConfigSchema>

export async function loadRepositoryConfig(
  configContent: string
): Promise<RepositoryConfig> {
  try {
    // Parse YAML
    const rawConfig = yaml.load(configContent) as unknown
    
    logger.debug({ 
      rawConfig: JSON.stringify(rawConfig, null, 2).substring(0, 500)
    }, 'Parsed YAML config')
    
    const config = RepositoryConfigSchema.parse(rawConfig)
    
    logger.info({ 
      teamName: config.team.name,
      membersCount: config.team.members.length,
      members: config.team.members.map(m => ({ github: m.github, slack: m.slack }))
    }, 'Repository config loaded and validated')
    
    return config
  } catch (error) {
    logger.error({ error, configContent: configContent.substring(0, 500) }, 'Failed to load repository config')
    throw error
  }
}
