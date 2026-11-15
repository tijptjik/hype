// DRIZZLE
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { user } from './user'

/** Current system issues are independent of Feature and Project ownership. */
export const systemTask = sqliteTable(
  'systemTask',
  {
    id: text('id').primaryKey(),
    resource: text('resource', { enum: ['location', 'premisesMap'] }).notNull(),
    resourceId: text('resourceId').notNull(),
    type: text('type').notNull(),
    sourceSnapshotHash: text('sourceSnapshotHash'),
    title: text('title').notNull(),
    message: text('message').notNull(),
    isReviewed: integer('isReviewed', { mode: 'boolean' }).notNull().default(false),
    reviewOutcome: text('reviewOutcome', { enum: ['accepted', 'rejected'] }),
    reviewerId: text('reviewerId').references(() => user.id),
    createdAt: text('createdAt').notNull(),
    modifiedAt: text('modifiedAt').notNull(),
  },
  t => [index('systemTask_queue').on(t.isReviewed, t.resource, t.modifiedAt)],
)
