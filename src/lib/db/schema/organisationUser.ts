// DRIZZLE
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { organisation } from './organisation'

/** Audience policy is independent of organisation staff permissions. */
export const organisationUserPolicy = sqliteTable('organisationUserPolicy', {
  organisationId: text('organisationId')
    .primaryKey()
    .notNull()
    .references(() => organisation.id, { onDelete: 'cascade' }),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  hubSignIn: integer('hubSignIn', { mode: 'boolean' }).notNull().default(false),
  emailDomain: text('emailDomain'),
  customCard: integer('customCard', { mode: 'boolean' }).notNull().default(false),
  revision: integer('revision').notNull().default(0),
})
