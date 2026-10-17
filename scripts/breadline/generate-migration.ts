// NODE
import { writeFileSync } from 'node:fs'
// DRIZZLE
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
// SCHEMA
import * as schema from '../../src/lib/db/schema'

// Isolate this additive migration from older, unrelated snapshot drift.
const current = await generateSQLiteDrizzleJson(schema)
const previous = structuredClone(current)
delete previous.tables.user.columns.telephone
const statements = await generateSQLiteMigration(previous, current)
writeFileSync(
  'migrations/0085_breadline_users.sql',
  '-- Refs #189, #194. Schema only; no source data.\n' +
    statements.join('\n--> statement-breakpoint\n') +
    '\n',
)
