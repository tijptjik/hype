// DRIZZLE
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Better Auth device grants, claimed by a signed-in HYPE account in the browser. */
export const deviceCode = sqliteTable('deviceCode', {
  id: text().primaryKey(),
  deviceCode: text().notNull().unique(),
  userCode: text().notNull().unique(),
  userId: text(),
  expiresAt: integer({ mode: 'timestamp_ms' }).notNull(),
  status: text().notNull(),
  lastPolledAt: integer({ mode: 'timestamp_ms' }),
  pollingInterval: integer(),
  clientId: text(),
  scope: text(),
})
