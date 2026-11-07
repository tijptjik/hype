// DRIZZLE
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { feature } from './feature'
import { featureRevisionProposal } from './featureRevision'

/** Explicit local/deployment cutover switch; installing the schema alone never enrolls Features. */
export const featureRevisionCreationPolicy = sqliteTable(
  'featureRevisionCreationPolicy',
  {
    singleton: integer('singleton').primaryKey(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  },
)

/** First proposal owning a private, never-published creation projection. */
export const featureInitialRevision = sqliteTable('featureInitialRevision', {
  featureId: text('featureId')
    .primaryKey()
    .references(() => feature.id),
  proposalId: text('proposalId')
    .notNull()
    .unique()
    .references(() => featureRevisionProposal.id),
  mode: text('mode', { enum: ['staff', 'contribution'] }).notNull(),
})
