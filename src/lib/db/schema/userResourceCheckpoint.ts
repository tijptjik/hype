// DRIZZLE
import { sql } from 'drizzle-orm'
import { check, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { user } from './user'
// TYPES
import type { FirstClassResource } from '#lib/enums.js'

/** Private per-user, per-resource progress; each owning feature supplies a checkpoint kind. */
export const userResourceCheckpoint = sqliteTable(
  'userResourceCheckpoint',
  {
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    resourceType: text('resourceType').$type<`${FirstClassResource}`>().notNull(),
    resourceId: text('resourceId').notNull(),
    checkpointKind: text('checkpointKind').notNull(),
    checkedThrough: text('checkedThrough').notNull(),
  },
  table => [
    primaryKey({
      columns: [
        table.userId,
        table.resourceType,
        table.resourceId,
        table.checkpointKind,
      ],
    }),
    check(
      'user_resource_checkpoint_resource',
      sql`${table.resourceType} IN ('location','organisation','project','layer','feature','task','hub','property','user')`,
    ),
    check(
      'user_resource_checkpoint_kind',
      sql`length(trim(${table.checkpointKind})) > 0`,
    ),
    check(
      'user_resource_checkpoint_time',
      sql`${table.checkedThrough} GLOB '????-??-??T??:??:??.???Z'`,
    ),
  ],
)
