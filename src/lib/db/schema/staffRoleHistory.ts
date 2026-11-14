// DRIZZLE
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Transaction-local attribution for role triggers; always removed in the same batch. */
export const staffRoleHistoryContext = sqliteTable('staffRoleHistoryContext', {
  token: text('token').primaryKey(),
  actorId: text('actorId').notNull(),
  origin: text('origin').notNull(),
  reason: text('reason'),
  createdAt: text('createdAt').notNull(),
})

/** Immutable trigger evidence; before/after JSON is retained even after subjects leave. */
export const staffRoleHistory = sqliteTable('staffRoleHistory', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  batchId: text('batchId').notNull(),
  resource: text('resource', { enum: ['hub', 'organisation', 'project'] }).notNull(),
  resourceId: text('resourceId').notNull(),
  userId: text('userId').notNull(),
  subjectLabel: text('subjectLabel').notNull(),
  actorId: text('actorId').notNull(),
  origin: text('origin').notNull(),
  reason: text('reason'),
  createdAt: text('createdAt').notNull(),
  baseline: integer('baseline', { mode: 'boolean' }).notNull().default(false),
  beforeValue: text('beforeValue'),
  afterValue: text('afterValue'),
})
