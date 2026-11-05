// DRIZZLE
import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Explicit activation per resource; installing history storage alone never enrolls live rows. */
export const adminResourceRevisionRollout = sqliteTable(
  'adminResourceRevisionRollout',
  {
    resource: text('resource', { enum: ['project', 'layer', 'hub'] }).primaryKey(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  },
  table => [
    check(
      'admin_revision_resource',
      sql`${table.resource} IN ('project','layer','hub')`,
    ),
    check('admin_revision_enabled', sql`${table.enabled} IN (0,1)`),
  ],
)
