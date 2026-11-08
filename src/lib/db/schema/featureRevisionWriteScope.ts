// DRIZZLE
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { featureRevisionHead } from './featureRevision'

/** Transaction-local permission for a validated projection; every successful batch removes it. */
export const featureRevisionWriteScope = sqliteTable('featureRevisionWriteScope', {
  featureId: text('featureId')
    .primaryKey()
    .notNull()
    .references(() => featureRevisionHead.featureId),
  token: text('token').notNull(),
})
