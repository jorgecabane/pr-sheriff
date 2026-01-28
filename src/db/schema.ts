import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core'

/**
 * GitHub App Installations
 * Trackea las instalaciones de la GitHub App en organizaciones/repositorios
 */
export const installations = pgTable('installations', {
  id: text('id').primaryKey(), // GitHub installation ID
  accountId: text('account_id').notNull(), // GitHub account ID (org o user)
  accountType: text('account_type').notNull(), // 'Organization' o 'User'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

/**
 * Repositories
 * Repositorios que tienen `.pr-sheriff.yml` configurado
 */
export const repositories = pgTable('repositories', {
  id: text('id').primaryKey(), // `${installationId}/${owner}/${repo}`
  installationId: text('installation_id').notNull().references(() => installations.id),
  owner: text('owner').notNull(), // GitHub owner (org o user)
  name: text('name').notNull(), // Repository name
  fullName: text('full_name').notNull(), // `${owner}/${name}`
  defaultBranch: text('default_branch').notNull().default('main'),
  configHash: text('config_hash'), // Hash del `.pr-sheriff.yml` para detectar cambios
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

/**
 * Pull Requests
 * Trackea PRs abiertos y su estado
 */
export const pullRequests = pgTable('pull_requests', {
  id: text('id').primaryKey(), // `${repoId}/pr/${number}`
  repositoryId: text('repository_id').notNull().references(() => repositories.id),
  number: integer('number').notNull(), // PR number
  title: text('title').notNull(),
  author: text('author').notNull(), // GitHub username del autor
  state: text('state').notNull().default('open'), // 'open', 'closed', 'merged'
  baseBranch: text('base_branch').notNull(),
  headBranch: text('head_branch').notNull(),
  createdAt: timestamp('created_at').notNull(), // GitHub created_at
  updatedAt: timestamp('updated_at').notNull(), // GitHub updated_at
  lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(), // Última vez que sincronizamos desde GitHub
})

/**
 * Notifications
 * Trackea notificaciones enviadas para evitar duplicados
 */
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(), // `${type}/${deliveryId}` o `${type}/${prId}/${recipient}`
  type: text('type').notNull(), // 'new_pr', 'reminder', 'blame'
  deliveryId: text('delivery_id'), // GitHub webhook delivery ID (para new_pr)
  prId: text('pr_id').references(() => pullRequests.id), // PR relacionado
  recipient: text('recipient').notNull(), // Slack user ID o channel ID
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  metadata: jsonb('metadata'), // Info adicional (reviewers, labels, etc.)
})

/**
 * Assignment History
 * Historial de asignaciones para round-robin strategy
 */
export const assignmentHistory = pgTable('assignment_history', {
  id: text('id').primaryKey(), // `${repositoryId}/${strategy}`
  repositoryId: text('repository_id').notNull().references(() => repositories.id),
  strategy: text('strategy').notNull(), // 'round-robin', 'random', etc.
  lastAssignedReviewer: text('last_assigned_reviewer').notNull(), // GitHub username
  lastAssignedAt: timestamp('last_assigned_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Types exportados para uso en el código
export type Installation = typeof installations.$inferSelect
export type NewInstallation = typeof installations.$inferInsert

export type Repository = typeof repositories.$inferSelect
export type NewRepository = typeof repositories.$inferInsert

export type PullRequest = typeof pullRequests.$inferSelect
export type NewPullRequest = typeof pullRequests.$inferInsert

export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert

export type AssignmentHistory = typeof assignmentHistory.$inferSelect
export type NewAssignmentHistory = typeof assignmentHistory.$inferInsert
